/**
 * Security Apps Manager
 *
 * Unified manager for Boundary Daemon and Boundary SIEM integrations.
 * Provides a single interface for policy decisions, audit logging,
 * and security event management.
 *
 * @see https://github.com/kase1111-hash/boundary-daemon-
 * @see https://github.com/kase1111-hash/Boundary-SIEM
 */

import { logger } from '../utils/logger';
import { BoundaryDaemonClient, PolicyDecision, BoundaryMode, EnvironmentStatus } from './BoundaryDaemonClient';
import { BoundarySIEMClient, SIEMAlert, EventCategory, SIEMSeverity, MITRETactic } from './BoundarySIEMClient';
import { SecurityAppsConfig, loadSecurityAppsConfig, validateSecurityAppsConfig } from './SecurityAppsConfig';

/**
 * Combined health status for security apps
 */
export interface SecurityAppsHealth {
  overall: boolean;
  boundaryDaemon: {
    enabled: boolean;
    healthy: boolean;
    mode?: BoundaryMode;
    details?: Record<string, unknown>;
  };
  boundarySIEM: {
    enabled: boolean;
    healthy: boolean;
    queuedEvents?: number;
    details?: Record<string, unknown>;
  };
  timestamp: number;
}

/**
 * Security action context for integrated logging
 */
export interface SecurityActionContext {
  actor: string;
  action: string;
  resource: string;
  category?: EventCategory;
  severity?: SIEMSeverity;
  transactionHash?: string;
  intentHash?: string;
  settlementId?: string;
  mitreTactic?: MITRETactic;
  mitreTechnique?: string;
  details?: Record<string, unknown>;
}

/**
 * SecurityAppsManager provides unified access to Boundary Daemon
 * and Boundary SIEM security services.
 */
export class SecurityAppsManager {
  private config: SecurityAppsConfig;
  private daemonClient: BoundaryDaemonClient | null = null;
  private siemClient: BoundarySIEMClient | null = null;
  private initialized: boolean = false;

  constructor(config?: Partial<SecurityAppsConfig>) {
    const loadedConfig = loadSecurityAppsConfig();
    this.config = config ? this.mergeConfig(loadedConfig, config) : loadedConfig;

    // Validate configuration
    const errors = validateSecurityAppsConfig(this.config);
    if (errors.length > 0) {
      logger.warn('Security apps configuration has issues', { errors });
    }
  }

  /**
   * Merge configuration objects
   */
  private mergeConfig(
    base: SecurityAppsConfig,
    override: Partial<SecurityAppsConfig>
  ): SecurityAppsConfig {
    return {
      enabled: override.enabled ?? base.enabled,
      boundaryDaemon: {
        ...base.boundaryDaemon,
        ...override.boundaryDaemon,
      },
      boundarySIEM: {
        ...base.boundarySIEM,
        ...override.boundarySIEM,
      },
    };
  }

  /**
   * Initialize security apps connections
   */
  public async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Security apps integration is disabled');
      return;
    }

    const initPromises: Promise<void>[] = [];

    if (this.config.boundaryDaemon.enabled) {
      initPromises.push(this.initializeBoundaryDaemon());
    }

    if (this.config.boundarySIEM.enabled) {
      initPromises.push(this.initializeBoundarySIEM());
    }

    await Promise.allSettled(initPromises);
    this.initialized = true;

    logger.info('Security apps manager initialized', {
      daemonEnabled: this.config.boundaryDaemon.enabled,
      siemEnabled: this.config.boundarySIEM.enabled,
      daemonConnected: this.daemonClient?.isConnected() ?? false,
      siemConnected: this.siemClient?.isConnected() ?? false,
    });
  }

  /**
   * Initialize Boundary Daemon client
   */
  private async initializeBoundaryDaemon(): Promise<void> {
    try {
      this.daemonClient = new BoundaryDaemonClient(this.config.boundaryDaemon);
      const connected = await this.daemonClient.connect();

      if (!connected) {
        logger.warn('Failed to connect to Boundary Daemon', {
          url: this.config.boundaryDaemon.baseUrl,
          failOpen: this.config.boundaryDaemon.failOpen,
        });
      }
    } catch (error) {
      logger.error('Error initializing Boundary Daemon client', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Initialize Boundary SIEM client
   */
  private async initializeBoundarySIEM(): Promise<void> {
    try {
      this.siemClient = new BoundarySIEMClient(this.config.boundarySIEM);
      const connected = await this.siemClient.connect();

      if (!connected) {
        logger.warn('Failed to connect to Boundary SIEM', {
          url: this.config.boundarySIEM.baseUrl,
        });
      }
    } catch (error) {
      logger.error('Error initializing Boundary SIEM client', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if a security action is allowed
   * Integrates with Boundary Daemon for policy decisions
   */
  public async isActionAllowed(
    action: string,
    resource: string,
    context?: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.daemonClient) {
      return true; // No daemon configured, allow by default
    }

    return this.daemonClient.isActionAllowed(action, resource, context);
  }

  /**
   * Request a policy decision with full details
   */
  public async requestPolicyDecision(
    action: string,
    resource: string,
    context?: Record<string, unknown>
  ): Promise<PolicyDecision | null> {
    if (!this.daemonClient) {
      return null;
    }

    return this.daemonClient.requestPolicyDecision(action, resource, context);
  }

  /**
   * Log a security action to both Daemon (audit) and SIEM (events)
   */
  public async logSecurityAction(
    context: SecurityActionContext,
    outcome: 'success' | 'failure' | 'blocked'
  ): Promise<void> {
    const logPromises: Promise<unknown>[] = [];

    // Log to Boundary Daemon audit trail
    if (this.daemonClient) {
      logPromises.push(
        this.daemonClient.logSecurityAction(
          context.action,
          context.actor,
          context.resource,
          outcome,
          context.details
        )
      );
    }

    // Log to Boundary SIEM
    if (this.siemClient) {
      // Convert 'blocked' to 'failure' for SIEM (SIEM uses success/failure/unknown)
      const siemOutcome: 'success' | 'failure' | 'unknown' = outcome === 'blocked' ? 'failure' : outcome;
      logPromises.push(
        this.siemClient.submitEvent({
          name: `security_${context.action}`,
          category: context.category || 'application',
          severity: context.severity ?? (outcome === 'failure' ? 5 : 3),
          source: 'mediator-node',
          action: context.action,
          outcome: siemOutcome,
          actor: context.actor,
          destination: context.resource,
          transactionHash: context.transactionHash,
          intentHash: context.intentHash,
          settlementId: context.settlementId,
          mitreTactic: context.mitreTactic,
          mitreTechnique: context.mitreTechnique,
          details: context.details,
        })
      );
    }

    await Promise.allSettled(logPromises);
  }

  /**
   * Log a blockchain event
   */
  public async logBlockchainEvent(
    name: string,
    action: string,
    outcome: 'success' | 'failure' | 'unknown',
    details?: {
      transactionHash?: string;
      intentHash?: string;
      settlementId?: string;
      actor?: string;
      severity?: SIEMSeverity;
    }
  ): Promise<void> {
    if (this.siemClient) {
      await this.siemClient.logBlockchainEvent(name, action, outcome, details);
    }
  }

  /**
   * Log an authentication event
   */
  public async logAuthEvent(
    action: string,
    actor: string,
    outcome: 'success' | 'failure' | 'unknown',
    details?: Record<string, unknown>
  ): Promise<void> {
    const logPromises: Promise<unknown>[] = [];

    if (this.daemonClient) {
      // Convert 'unknown' to 'failure' for daemon (daemon uses success/failure/blocked)
      const daemonOutcome: 'success' | 'failure' | 'blocked' = outcome === 'unknown' ? 'failure' : outcome;
      logPromises.push(
        this.daemonClient.logAuditEvent({
          eventType: 'authentication',
          action,
          actor,
          resource: 'auth_system',
          outcome: daemonOutcome,
          details,
        })
      );
    }

    if (this.siemClient) {
      logPromises.push(
        this.siemClient.logAuthEvent(action, actor, outcome, details)
      );
    }

    await Promise.allSettled(logPromises);
  }

  /**
   * Log an access control event
   */
  public async logAccessEvent(
    actor: string,
    resource: string,
    allowed: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    const logPromises: Promise<unknown>[] = [];

    if (this.daemonClient) {
      logPromises.push(
        this.daemonClient.logAccessDecision(actor, resource, allowed, details?.reason as string)
      );
    }

    if (this.siemClient) {
      logPromises.push(
        this.siemClient.logAccessEvent(resource, actor, allowed, details)
      );
    }

    await Promise.allSettled(logPromises);
  }

  /**
   * Log a settlement event
   */
  public async logSettlementEvent(
    action: string,
    settlementId: string,
    outcome: 'success' | 'failure' | 'unknown',
    details?: {
      actor?: string;
      intentHashes?: string[];
      transactionHash?: string;
    }
  ): Promise<void> {
    const logPromises: Promise<unknown>[] = [];

    if (this.daemonClient) {
      // Convert 'unknown' to 'failure' for daemon (daemon uses success/failure/blocked)
      const daemonOutcome: 'success' | 'failure' | 'blocked' = outcome === 'unknown' ? 'failure' : outcome;
      logPromises.push(
        this.daemonClient.logAuditEvent({
          eventType: 'settlement',
          action,
          actor: details?.actor || 'system',
          resource: settlementId,
          outcome: daemonOutcome,
          details: {
            intentHashes: details?.intentHashes,
            transactionHash: details?.transactionHash,
          },
        })
      );
    }

    if (this.siemClient) {
      logPromises.push(
        this.siemClient.logSettlementEvent(action, settlementId, outcome, details)
      );
    }

    await Promise.allSettled(logPromises);
  }

  /**
   * Log a policy violation
   */
  public async logPolicyViolation(
    policyName: string,
    actor: string,
    resource: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const logPromises: Promise<unknown>[] = [];

    if (this.daemonClient) {
      logPromises.push(
        this.daemonClient.logAuditEvent({
          eventType: 'policy_violation',
          action: `violated_${policyName}`,
          actor,
          resource,
          outcome: 'blocked',
          details,
        })
      );
    }

    if (this.siemClient) {
      logPromises.push(
        this.siemClient.logPolicyViolation(policyName, actor, resource, details)
      );
    }

    await Promise.allSettled(logPromises);
  }

  /**
   * Log a threat detection
   */
  public async logThreatDetection(
    threatName: string,
    severity: SIEMSeverity,
    details: {
      actor?: string;
      source?: string;
      destination?: string;
      mitreTactic?: MITRETactic;
      mitreTechnique?: string;
    }
  ): Promise<void> {
    if (this.siemClient) {
      await this.siemClient.logThreatDetection(threatName, severity, details);
    }

    if (this.daemonClient) {
      await this.daemonClient.logAuditEvent({
        eventType: 'threat_detection',
        action: 'threat_detected',
        actor: details.actor || 'system',
        resource: details.destination || 'unknown',
        outcome: 'blocked',
        details: {
          threatName,
          severity,
          mitreTactic: details.mitreTactic,
          mitreTechnique: details.mitreTechnique,
        },
      });
    }
  }

  /**
   * Get the current boundary mode
   */
  public async getCurrentMode(): Promise<BoundaryMode | null> {
    if (!this.daemonClient) {
      return null;
    }

    return this.daemonClient.getCurrentMode();
  }

  /**
   * Get environment status from Boundary Daemon
   */
  public async getEnvironmentStatus(): Promise<EnvironmentStatus | null> {
    if (!this.daemonClient) {
      return null;
    }

    return this.daemonClient.getEnvironmentStatus();
  }

  /**
   * Check if in lockdown mode
   */
  public async isInLockdown(): Promise<boolean> {
    if (!this.daemonClient) {
      return false;
    }

    return this.daemonClient.isInLockdown();
  }

  /**
   * Get active alerts from SIEM
   */
  public async getActiveAlerts(severity?: SIEMSeverity): Promise<SIEMAlert[]> {
    if (!this.siemClient) {
      return [];
    }

    return this.siemClient.getAlerts({
      severity,
      status: 'new',
    });
  }

  /**
   * Get health status of all security apps
   */
  public async getHealth(): Promise<SecurityAppsHealth> {
    const health: SecurityAppsHealth = {
      overall: true,
      boundaryDaemon: {
        enabled: this.config.boundaryDaemon.enabled,
        healthy: false,
      },
      boundarySIEM: {
        enabled: this.config.boundarySIEM.enabled,
        healthy: false,
      },
      timestamp: Date.now(),
    };

    const healthPromises: Promise<void>[] = [];

    if (this.daemonClient) {
      healthPromises.push(
        this.daemonClient.healthCheck().then(result => {
          health.boundaryDaemon.healthy = result.healthy;
          health.boundaryDaemon.mode = result.details?.mode as BoundaryMode;
          health.boundaryDaemon.details = result.details;
        })
      );
    } else if (this.config.boundaryDaemon.enabled) {
      health.overall = false;
    }

    if (this.siemClient) {
      healthPromises.push(
        this.siemClient.healthCheck().then(result => {
          health.boundarySIEM.healthy = result.healthy;
          health.boundarySIEM.queuedEvents = result.details?.queuedEvents as number;
          health.boundarySIEM.details = result.details;
        })
      );
    } else if (this.config.boundarySIEM.enabled) {
      health.overall = false;
    }

    await Promise.allSettled(healthPromises);

    // Calculate overall health
    if (this.config.boundaryDaemon.enabled && !health.boundaryDaemon.healthy) {
      health.overall = false;
    }
    if (this.config.boundarySIEM.enabled && !health.boundarySIEM.healthy) {
      health.overall = false;
    }

    return health;
  }

  /**
   * Shutdown security apps connections
   */
  public async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    if (this.daemonClient) {
      this.daemonClient.disconnect();
    }

    if (this.siemClient) {
      shutdownPromises.push(this.siemClient.disconnect());
    }

    await Promise.allSettled(shutdownPromises);

    this.initialized = false;
    logger.info('Security apps manager shutdown complete');
  }

  /**
   * Check if the manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the Boundary Daemon client (for advanced usage)
   */
  public getDaemonClient(): BoundaryDaemonClient | null {
    return this.daemonClient;
  }

  /**
   * Get the Boundary SIEM client (for advanced usage)
   */
  public getSIEMClient(): BoundarySIEMClient | null {
    return this.siemClient;
  }
}

/**
 * Create a singleton instance of the SecurityAppsManager
 */
let securityAppsManagerInstance: SecurityAppsManager | null = null;

export function getSecurityAppsManager(): SecurityAppsManager {
  if (!securityAppsManagerInstance) {
    securityAppsManagerInstance = new SecurityAppsManager();
  }
  return securityAppsManagerInstance;
}

export function resetSecurityAppsManager(): void {
  if (securityAppsManagerInstance) {
    securityAppsManagerInstance.shutdown().catch(() => {});
    securityAppsManagerInstance = null;
  }
}
