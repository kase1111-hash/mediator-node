/**
 * Boundary Daemon Client
 *
 * Integration with the Boundary Daemon security layer for policy decisions
 * and audit logging. The Boundary Daemon provides environment monitoring,
 * policy enforcement, and tamper-evident audit trails.
 *
 * @see https://github.com/kase1111-hash/boundary-daemon-
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

/**
 * Boundary modes define the security posture of the environment
 */
export type BoundaryMode =
  | 'OPEN'       // Online, casual usage
  | 'RESTRICTED' // Online, research work
  | 'TRUSTED'    // VPN only, serious work
  | 'AIRGAP'     // Offline, high-value IP protection
  | 'COLDROOM'   // Offline, crown jewel data
  | 'LOCKDOWN';  // Blocked, emergency response

/**
 * Memory classification levels for data sensitivity
 */
export type MemoryClass = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Policy decision result from the Boundary Daemon
 */
export interface PolicyDecision {
  allowed: boolean;
  mode: BoundaryMode;
  reason?: string;
  memoryClass?: MemoryClass;
  timestamp: number;
  decisionId: string;
}

/**
 * Audit event to be logged to the Boundary Daemon
 */
export interface AuditEvent {
  eventType: string;
  action: string;
  actor: string;
  resource: string;
  outcome: 'success' | 'failure' | 'blocked';
  details?: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Audit log entry returned from the daemon
 */
export interface AuditLogEntry extends AuditEvent {
  eventId: string;
  signature: string;
  timestamp: number;
}

/**
 * Environment status from the Boundary Daemon
 */
export interface EnvironmentStatus {
  mode: BoundaryMode;
  networkState: 'online' | 'offline' | 'vpn_only' | 'blocked';
  memoryClasses: MemoryClass[];
  tripwireStatus: 'normal' | 'triggered' | 'reset_pending';
  lastCheck: number;
  processes: number;
  usbDevices: number;
}

/**
 * Configuration for the Boundary Daemon client
 */
export interface BoundaryDaemonConfig {
  /** Base URL for the Boundary Daemon API (default: http://localhost:9000) */
  baseUrl: string;
  /** Unix socket path (alternative to HTTP API) */
  socketPath?: string;
  /** API authentication token */
  apiToken?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout: number;
  /** Whether to fail open if daemon is unavailable (default: false) */
  failOpen: boolean;
  /** Retry attempts for failed requests (default: 3) */
  retryAttempts: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: BoundaryDaemonConfig = {
  baseUrl: 'http://localhost:9000',
  timeout: 5000,
  failOpen: false,
  retryAttempts: 3,
};

/**
 * BoundaryDaemonClient provides integration with the Boundary Daemon
 * security layer for policy decisions and audit logging.
 */
export class BoundaryDaemonClient {
  private config: BoundaryDaemonConfig;
  private client: AxiosInstance;
  private connected: boolean = false;
  private lastMode: BoundaryMode = 'RESTRICTED';

  constructor(config: Partial<BoundaryDaemonConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = this.createClient();
  }

  /**
   * Create the HTTP client for communicating with the daemon
   */
  private createClient(): AxiosInstance {
    const clientConfig: Record<string, unknown> = {
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'mediator-node/1.0.0',
      },
    };

    if (this.config.apiToken) {
      (clientConfig.headers as Record<string, string>)['Authorization'] = `Bearer ${this.config.apiToken}`;
    }

    if (this.config.socketPath) {
      clientConfig.socketPath = this.config.socketPath;
    }

    return axios.create(clientConfig);
  }

  /**
   * Initialize connection to the Boundary Daemon
   */
  public async connect(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      if (response.status === 200) {
        this.connected = true;
        logger.info('Connected to Boundary Daemon', {
          url: this.config.baseUrl,
          mode: response.data?.mode,
        });
        return true;
      }
      return false;
    } catch (error) {
      logger.warn('Failed to connect to Boundary Daemon', {
        url: this.config.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.connected = false;
      return false;
    }
  }

  /**
   * Check if connected to the daemon
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the current environment status
   */
  public async getEnvironmentStatus(): Promise<EnvironmentStatus | null> {
    try {
      const response = await this.retryRequest(() =>
        this.client.get('/api/v1/status')
      );
      this.lastMode = response.data.mode;
      return response.data;
    } catch (error) {
      logger.error('Failed to get environment status', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Request a policy decision from the Boundary Daemon
   */
  public async requestPolicyDecision(
    action: string,
    resource: string,
    context?: Record<string, unknown>
  ): Promise<PolicyDecision> {
    const defaultDecision: PolicyDecision = {
      allowed: this.config.failOpen,
      mode: this.lastMode,
      reason: this.config.failOpen ? 'Daemon unavailable, fail-open enabled' : 'Daemon unavailable',
      timestamp: Date.now(),
      decisionId: `fallback-${Date.now()}`,
    };

    try {
      const response = await this.retryRequest(() =>
        this.client.post('/api/v1/policy/decide', {
          action,
          resource,
          context,
          timestamp: Date.now(),
        })
      );

      this.lastMode = response.data.mode;
      return response.data;
    } catch (error) {
      logger.error('Failed to get policy decision', {
        action,
        resource,
        error: error instanceof Error ? error.message : 'Unknown error',
        failOpen: this.config.failOpen,
      });
      return defaultDecision;
    }
  }

  /**
   * Check if an action is allowed under the current policy
   */
  public async isActionAllowed(
    action: string,
    resource: string,
    context?: Record<string, unknown>
  ): Promise<boolean> {
    const decision = await this.requestPolicyDecision(action, resource, context);
    return decision.allowed;
  }

  /**
   * Log an audit event to the Boundary Daemon
   */
  public async logAuditEvent(event: AuditEvent): Promise<AuditLogEntry | null> {
    try {
      const eventWithTimestamp = {
        ...event,
        timestamp: event.timestamp || Date.now(),
      };

      const response = await this.retryRequest(() =>
        this.client.post('/api/v1/audit/log', eventWithTimestamp)
      );

      logger.debug('Audit event logged to Boundary Daemon', {
        eventId: response.data.eventId,
        eventType: event.eventType,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to log audit event', {
        eventType: event.eventType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Log a security-related action
   */
  public async logSecurityAction(
    action: string,
    actor: string,
    resource: string,
    outcome: 'success' | 'failure' | 'blocked',
    details?: Record<string, unknown>
  ): Promise<AuditLogEntry | null> {
    return this.logAuditEvent({
      eventType: 'security_action',
      action,
      actor,
      resource,
      outcome,
      details,
    });
  }

  /**
   * Log an access control decision
   */
  public async logAccessDecision(
    actor: string,
    resource: string,
    allowed: boolean,
    reason?: string
  ): Promise<AuditLogEntry | null> {
    return this.logAuditEvent({
      eventType: 'access_control',
      action: 'access_request',
      actor,
      resource,
      outcome: allowed ? 'success' : 'blocked',
      details: { reason },
    });
  }

  /**
   * Get the current boundary mode
   */
  public async getCurrentMode(): Promise<BoundaryMode> {
    const status = await this.getEnvironmentStatus();
    return status?.mode || this.lastMode;
  }

  /**
   * Check if the current mode allows network access
   */
  public async isNetworkAllowed(): Promise<boolean> {
    const mode = await this.getCurrentMode();
    return ['OPEN', 'RESTRICTED', 'TRUSTED'].includes(mode);
  }

  /**
   * Check if the current mode is in lockdown
   */
  public async isInLockdown(): Promise<boolean> {
    const mode = await this.getCurrentMode();
    return mode === 'LOCKDOWN';
  }

  /**
   * Query audit logs
   */
  public async queryAuditLogs(
    filters?: {
      eventType?: string;
      actor?: string;
      startTime?: number;
      endTime?: number;
      limit?: number;
    }
  ): Promise<AuditLogEntry[]> {
    try {
      const response = await this.retryRequest(() =>
        this.client.get('/api/v1/audit/query', { params: filters })
      );
      return response.data.events || [];
    } catch (error) {
      logger.error('Failed to query audit logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt >= this.config.retryAttempts) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 100; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));

      return this.retryRequest(requestFn, attempt + 1);
    }
  }

  /**
   * Disconnect from the daemon
   */
  public disconnect(): void {
    this.connected = false;
    logger.info('Disconnected from Boundary Daemon');
  }

  /**
   * Get health check status for monitoring
   */
  public async healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    try {
      const response = await this.client.get('/health', { timeout: 2000 });
      return {
        healthy: response.status === 200,
        details: {
          mode: response.data?.mode,
          connected: true,
          lastCheck: Date.now(),
        },
      };
    } catch {
      return {
        healthy: false,
        details: {
          connected: false,
          lastCheck: Date.now(),
          failOpen: this.config.failOpen,
        },
      };
    }
  }
}
