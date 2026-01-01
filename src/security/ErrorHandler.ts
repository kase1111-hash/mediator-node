/**
 * Centralized Error Handler with Security Reporting
 *
 * Provides comprehensive error handling that reports to Boundary SIEM
 * and integrates with Boundary Daemon for security decisions.
 *
 * @see https://github.com/kase1111-hash/Boundary-SIEM
 * @see https://github.com/kase1111-hash/boundary-daemon-
 */

import { logger } from '../utils/logger';
import { SecurityAppsManager } from './SecurityAppsManager';
import { SIEMSeverity, MITRETactic, EventCategory } from './BoundarySIEMClient';

/**
 * Error severity levels for classification
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'network'
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'blockchain'
  | 'consensus'
  | 'settlement'
  | 'system'
  | 'security'
  | 'configuration';

/**
 * Structured error context for reporting
 */
export interface ErrorContext {
  /** Operation being performed when error occurred */
  operation: string;
  /** Component where error originated */
  component: string;
  /** Error category for classification */
  category: ErrorCategory;
  /** Error severity */
  severity: ErrorSeverity;
  /** Actor/user associated with the error */
  actor?: string;
  /** Resource being accessed */
  resource?: string;
  /** Related transaction hash */
  transactionHash?: string;
  /** Related intent hash */
  intentHash?: string;
  /** Related settlement ID */
  settlementId?: string;
  /** Additional context details */
  details?: Record<string, unknown>;
  /** Whether this error should trigger security alerts */
  securityRelevant?: boolean;
  /** MITRE ATT&CK tactic if applicable */
  mitreTactic?: MITRETactic;
  /** MITRE ATT&CK technique if applicable */
  mitreTechnique?: string;
}

/**
 * Error reporting result
 */
export interface ErrorReportResult {
  logged: boolean;
  reportedToSIEM: boolean;
  reportedToDaemon: boolean;
  eventId?: string;
  auditId?: string;
}

/**
 * Map error severity to SIEM severity
 */
function mapSeverityToSIEM(severity: ErrorSeverity): SIEMSeverity {
  switch (severity) {
    case 'low':
      return 3;
    case 'medium':
      return 5;
    case 'high':
      return 7;
    case 'critical':
      return 9;
    default:
      return 5;
  }
}

/**
 * Map error category to SIEM event category
 */
function mapCategoryToSIEM(category: ErrorCategory): EventCategory {
  switch (category) {
    case 'authentication':
      return 'authentication';
    case 'authorization':
      return 'authorization';
    case 'blockchain':
    case 'consensus':
    case 'settlement':
      return 'blockchain';
    case 'network':
      return 'network';
    case 'security':
      return 'threat_detection';
    case 'configuration':
    case 'validation':
    case 'system':
    default:
      return 'application';
  }
}

/**
 * Centralized error handler that integrates with security apps
 */
export class ErrorHandler {
  private securityApps: SecurityAppsManager | null = null;
  private enabled: boolean = false;
  private errorCounts: Map<string, { count: number; lastTime: number }> = new Map();
  private readonly ERROR_RATE_WINDOW_MS = 60000; // 1 minute
  private readonly ERROR_RATE_THRESHOLD = 10; // errors per minute for rate alert

  constructor(securityApps?: SecurityAppsManager) {
    if (securityApps) {
      this.securityApps = securityApps;
      this.enabled = true;
    }
  }

  /**
   * Set the security apps manager
   */
  public setSecurityApps(securityApps: SecurityAppsManager): void {
    this.securityApps = securityApps;
    this.enabled = true;
  }

  /**
   * Handle an error with full security reporting
   */
  public async handleError(
    error: Error,
    context: ErrorContext
  ): Promise<ErrorReportResult> {
    const result: ErrorReportResult = {
      logged: false,
      reportedToSIEM: false,
      reportedToDaemon: false,
    };

    // Always log locally first
    this.logError(error, context);
    result.logged = true;

    // Track error rates
    this.trackErrorRate(context.category);

    // Check for error rate anomalies
    await this.checkErrorRateAnomaly(context);

    // Report to security apps if enabled
    if (this.enabled && this.securityApps) {
      try {
        // Report to SIEM
        const siemResult = await this.reportToSIEM(error, context);
        if (siemResult) {
          result.reportedToSIEM = true;
          result.eventId = siemResult;
        }

        // Report to Daemon audit log
        const daemonResult = await this.reportToDaemon(error, context);
        if (daemonResult) {
          result.reportedToDaemon = true;
          result.auditId = daemonResult;
        }
      } catch (reportingError) {
        logger.warn('Failed to report error to security apps', {
          originalError: error.message,
          reportingError: reportingError instanceof Error ? reportingError.message : 'Unknown',
        });
      }
    }

    return result;
  }

  /**
   * Handle a security-specific error with enhanced reporting
   */
  public async handleSecurityError(
    error: Error,
    context: Omit<ErrorContext, 'securityRelevant'> & {
      threatName?: string;
      blocked?: boolean;
    }
  ): Promise<ErrorReportResult> {
    const enhancedContext: ErrorContext = {
      ...context,
      securityRelevant: true,
      category: 'security',
      severity: context.severity || 'high',
    };

    const result = await this.handleError(error, enhancedContext);

    // Log additional threat detection if applicable
    if (this.securityApps && context.threatName) {
      try {
        await this.securityApps.logThreatDetection(
          context.threatName,
          mapSeverityToSIEM(context.severity),
          {
            actor: context.actor,
            destination: context.resource,
            mitreTactic: context.mitreTactic,
            mitreTechnique: context.mitreTechnique,
          }
        );
      } catch (threatError) {
        logger.warn('Failed to log threat detection', {
          threatName: context.threatName,
          error: threatError instanceof Error ? threatError.message : 'Unknown',
        });
      }
    }

    return result;
  }

  /**
   * Handle a network/connection error
   */
  public async handleConnectionError(
    error: Error,
    endpoint: string,
    connectionType: 'chain' | 'websocket' | 'siem' | 'daemon' | 'peer'
  ): Promise<ErrorReportResult> {
    return this.handleError(error, {
      operation: `${connectionType}_connection`,
      component: connectionType === 'websocket' ? 'WebSocketServer' : 'NetworkClient',
      category: 'network',
      severity: connectionType === 'chain' ? 'high' : 'medium',
      resource: endpoint,
      details: {
        connectionType,
        endpoint,
        errorCode: (error as any).code,
        errorType: error.name,
      },
    });
  }

  /**
   * Handle an authentication error
   */
  public async handleAuthError(
    error: Error,
    actor: string,
    resource: string,
    details?: Record<string, unknown>
  ): Promise<ErrorReportResult> {
    return this.handleSecurityError(error, {
      operation: 'authentication',
      component: 'AuthManager',
      category: 'authentication',
      severity: 'high',
      actor,
      resource,
      details,
      mitreTactic: 'credential_access',
    });
  }

  /**
   * Handle an authorization error
   */
  public async handleAuthzError(
    error: Error,
    actor: string,
    resource: string,
    action: string
  ): Promise<ErrorReportResult> {
    return this.handleSecurityError(error, {
      operation: action,
      component: 'PolicyEngine',
      category: 'authorization',
      severity: 'medium',
      actor,
      resource,
      details: { action },
      mitreTactic: 'privilege_escalation',
    });
  }

  /**
   * Handle a blockchain/settlement error
   */
  public async handleBlockchainError(
    error: Error,
    operation: string,
    details?: {
      transactionHash?: string;
      intentHash?: string;
      settlementId?: string;
      actor?: string;
    }
  ): Promise<ErrorReportResult> {
    return this.handleError(error, {
      operation,
      component: 'BlockchainClient',
      category: 'blockchain',
      severity: 'high',
      actor: details?.actor,
      transactionHash: details?.transactionHash,
      intentHash: details?.intentHash,
      settlementId: details?.settlementId,
      details,
    });
  }

  /**
   * Handle a validation error
   */
  public async handleValidationError(
    error: Error,
    operation: string,
    details?: Record<string, unknown>
  ): Promise<ErrorReportResult> {
    return this.handleError(error, {
      operation,
      component: 'Validator',
      category: 'validation',
      severity: 'low',
      details,
    });
  }

  /**
   * Log error locally
   */
  private logError(error: Error, context: ErrorContext): void {
    const logData = {
      error: error.message,
      stack: error.stack,
      operation: context.operation,
      component: context.component,
      category: context.category,
      severity: context.severity,
      actor: context.actor,
      resource: context.resource,
      transactionHash: context.transactionHash,
      intentHash: context.intentHash,
      settlementId: context.settlementId,
      securityRelevant: context.securityRelevant,
      details: context.details,
    };

    switch (context.severity) {
      case 'critical':
      case 'high':
        logger.error(`[${context.component}] ${context.operation} failed`, logData);
        break;
      case 'medium':
        logger.warn(`[${context.component}] ${context.operation} failed`, logData);
        break;
      case 'low':
      default:
        logger.info(`[${context.component}] ${context.operation} failed`, logData);
    }
  }

  /**
   * Report error to SIEM
   */
  private async reportToSIEM(
    error: Error,
    context: ErrorContext
  ): Promise<string | null> {
    if (!this.securityApps) return null;

    const siemClient = this.securityApps.getSIEMClient();
    if (!siemClient) return null;

    try {
      const result = await siemClient.submitEvent({
        name: `error_${context.operation}`,
        category: mapCategoryToSIEM(context.category),
        severity: mapSeverityToSIEM(context.severity),
        source: context.component,
        destination: context.resource,
        action: context.operation,
        outcome: 'failure',
        actor: context.actor,
        transactionHash: context.transactionHash,
        intentHash: context.intentHash,
        settlementId: context.settlementId,
        mitreTactic: context.mitreTactic,
        mitreTechnique: context.mitreTechnique,
        details: {
          errorMessage: error.message,
          errorType: error.name,
          ...context.details,
        },
      });

      return result?.eventId || null;
    } catch (err) {
      logger.debug('Failed to report to SIEM', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Report error to Boundary Daemon audit log
   */
  private async reportToDaemon(
    error: Error,
    context: ErrorContext
  ): Promise<string | null> {
    if (!this.securityApps) return null;

    const daemonClient = this.securityApps.getDaemonClient();
    if (!daemonClient) return null;

    try {
      const result = await daemonClient.logAuditEvent({
        eventType: `error_${context.category}`,
        action: context.operation,
        actor: context.actor || 'system',
        resource: context.resource || context.component,
        outcome: 'failure',
        details: {
          errorMessage: error.message,
          errorType: error.name,
          severity: context.severity,
          transactionHash: context.transactionHash,
          intentHash: context.intentHash,
          settlementId: context.settlementId,
          ...context.details,
        },
      });

      return result?.eventId || null;
    } catch (err) {
      logger.debug('Failed to report to Daemon', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Track error rates by category
   */
  private trackErrorRate(category: ErrorCategory): void {
    const now = Date.now();
    const key = category;
    const current = this.errorCounts.get(key);

    if (!current || now - current.lastTime > this.ERROR_RATE_WINDOW_MS) {
      this.errorCounts.set(key, { count: 1, lastTime: now });
    } else {
      current.count++;
      current.lastTime = now;
    }
  }

  /**
   * Check for error rate anomalies and alert
   */
  private async checkErrorRateAnomaly(context: ErrorContext): Promise<void> {
    const current = this.errorCounts.get(context.category);
    if (!current) return;

    if (current.count >= this.ERROR_RATE_THRESHOLD) {
      logger.warn('High error rate detected', {
        category: context.category,
        count: current.count,
        threshold: this.ERROR_RATE_THRESHOLD,
        windowMs: this.ERROR_RATE_WINDOW_MS,
      });

      // Report anomaly to SIEM
      if (this.securityApps) {
        try {
          await this.securityApps.logThreatDetection(
            `high_error_rate_anomaly_${context.category}`,
            7,
            {
              source: context.component,
              destination: `${context.category}:count=${current.count}`,
            }
          );
        } catch {
          // Ignore reporting errors for anomaly detection
        }
      }

      // Reset counter after alert
      this.errorCounts.set(context.category, { count: 0, lastTime: Date.now() });
    }
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): Record<string, { count: number; lastTime: number }> {
    const stats: Record<string, { count: number; lastTime: number }> = {};
    this.errorCounts.forEach((value, key) => {
      stats[key] = { ...value };
    });
    return stats;
  }

  /**
   * Clear error statistics
   */
  public clearErrorStats(): void {
    this.errorCounts.clear();
  }
}

/**
 * Global error handler instance
 */
let globalErrorHandler: ErrorHandler | null = null;

/**
 * Get or create the global error handler
 */
export function getErrorHandler(): ErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandler();
  }
  return globalErrorHandler;
}

/**
 * Initialize the global error handler with security apps
 */
export function initializeErrorHandler(securityApps: SecurityAppsManager): ErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandler(securityApps);
  } else {
    globalErrorHandler.setSecurityApps(securityApps);
  }
  return globalErrorHandler;
}

/**
 * Reset the global error handler (for testing)
 */
export function resetErrorHandler(): void {
  globalErrorHandler = null;
}
