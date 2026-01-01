/**
 * Boundary SIEM Client
 *
 * Integration with Boundary SIEM for security event management,
 * threat detection, and compliance monitoring. Boundary SIEM provides
 * real-time event correlation with blockchain-specific detection rules.
 *
 * @see https://github.com/kase1111-hash/Boundary-SIEM
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

/**
 * Severity levels for security events (CEF standard)
 */
export type SIEMSeverity = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Event categories for classification
 */
export type EventCategory =
  | 'authentication'
  | 'authorization'
  | 'blockchain'
  | 'network'
  | 'system'
  | 'application'
  | 'data_access'
  | 'policy_violation'
  | 'threat_detection'
  | 'compliance';

/**
 * MITRE ATT&CK tactic categories
 */
export type MITRETactic =
  | 'initial_access'
  | 'execution'
  | 'persistence'
  | 'privilege_escalation'
  | 'defense_evasion'
  | 'credential_access'
  | 'discovery'
  | 'lateral_movement'
  | 'collection'
  | 'exfiltration'
  | 'impact';

/**
 * Security event to be sent to the SIEM
 */
export interface SecurityEvent {
  /** Event name/type */
  name: string;
  /** Event category */
  category: EventCategory;
  /** Severity level (0-10, CEF standard) */
  severity: SIEMSeverity;
  /** Source of the event */
  source: string;
  /** Destination/target of the event */
  destination?: string;
  /** Actor/user who triggered the event */
  actor?: string;
  /** Action performed */
  action: string;
  /** Outcome of the action */
  outcome: 'success' | 'failure' | 'unknown';
  /** Additional event details */
  details?: Record<string, unknown>;
  /** MITRE ATT&CK tactic (if applicable) */
  mitreTactic?: MITRETactic;
  /** MITRE ATT&CK technique ID (if applicable) */
  mitreTechnique?: string;
  /** Related blockchain transaction hash */
  transactionHash?: string;
  /** Related intent hash */
  intentHash?: string;
  /** Related settlement ID */
  settlementId?: string;
  /** Event timestamp (defaults to current time) */
  timestamp?: number;
}

/**
 * Event submission response from the SIEM
 */
export interface EventResponse {
  eventId: string;
  received: boolean;
  timestamp: number;
  correlationId?: string;
}

/**
 * Alert from the SIEM
 */
export interface SIEMAlert {
  alertId: string;
  ruleId: string;
  ruleName: string;
  severity: SIEMSeverity;
  category: EventCategory;
  description: string;
  events: string[]; // Event IDs that triggered the alert
  mitreTactic?: MITRETactic;
  mitreTechnique?: string;
  timestamp: number;
  status: 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';
}

/**
 * Query filters for retrieving events
 */
export interface EventQueryFilters {
  startTime?: number;
  endTime?: number;
  category?: EventCategory;
  severity?: SIEMSeverity;
  source?: string;
  actor?: string;
  limit?: number;
  offset?: number;
}

/**
 * Configuration for the Boundary SIEM client
 */
export interface BoundarySIEMConfig {
  /** Base URL for the SIEM REST API (default: http://localhost:8080) */
  baseUrl: string;
  /** API authentication token */
  apiToken?: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout: number;
  /** Enable batch event submission (default: true) */
  batchEnabled: boolean;
  /** Batch size before auto-flush (default: 100) */
  batchSize: number;
  /** Batch flush interval in milliseconds (default: 5000) */
  batchFlushInterval: number;
  /** Retry attempts for failed requests (default: 3) */
  retryAttempts: number;
  /** Source identifier for events from this node */
  sourceId: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: BoundarySIEMConfig = {
  baseUrl: 'http://localhost:8080',
  timeout: 10000,
  batchEnabled: true,
  batchSize: 100,
  batchFlushInterval: 5000,
  retryAttempts: 3,
  sourceId: 'mediator-node',
};

/**
 * BoundarySIEMClient provides integration with Boundary SIEM for
 * security event management and threat detection.
 */
export class BoundarySIEMClient {
  private config: BoundarySIEMConfig;
  private client: AxiosInstance;
  private connected: boolean = false;
  private eventBatch: SecurityEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<BoundarySIEMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = this.createClient();

    if (this.config.batchEnabled) {
      this.startBatchFlushTimer();
    }
  }

  /**
   * Create the HTTP client for communicating with the SIEM
   */
  private createClient(): AxiosInstance {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `mediator-node/1.0.0 (${this.config.sourceId})`,
    };

    if (this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    }

    return axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers,
    });
  }

  /**
   * Initialize connection to the SIEM
   */
  public async connect(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v1/health');
      if (response.status === 200) {
        this.connected = true;
        logger.info('Connected to Boundary SIEM', {
          url: this.config.baseUrl,
          sourceId: this.config.sourceId,
        });
        return true;
      }
      return false;
    } catch (error) {
      logger.warn('Failed to connect to Boundary SIEM', {
        url: this.config.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.connected = false;
      return false;
    }
  }

  /**
   * Check if connected to the SIEM
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Submit a security event to the SIEM
   */
  public async submitEvent(event: SecurityEvent): Promise<EventResponse | null> {
    const enrichedEvent = this.enrichEvent(event);

    if (this.config.batchEnabled) {
      this.eventBatch.push(enrichedEvent);

      if (this.eventBatch.length >= this.config.batchSize) {
        await this.flushEvents();
      }

      return {
        eventId: `queued-${Date.now()}`,
        received: true,
        timestamp: Date.now(),
      };
    }

    return this.sendEvent(enrichedEvent);
  }

  /**
   * Submit multiple events at once
   */
  public async submitEvents(events: SecurityEvent[]): Promise<EventResponse[]> {
    const enrichedEvents = events.map(e => this.enrichEvent(e));

    try {
      const response = await this.retryRequest(() =>
        this.client.post('/api/v1/events/batch', { events: enrichedEvents })
      );

      logger.debug('Batch events submitted to Boundary SIEM', {
        count: events.length,
        correlationId: response.data.correlationId,
      });

      return response.data.results || [];
    } catch (error) {
      logger.error('Failed to submit batch events', {
        count: events.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Log a blockchain-related security event
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
      additionalDetails?: Record<string, unknown>;
    }
  ): Promise<EventResponse | null> {
    return this.submitEvent({
      name,
      category: 'blockchain',
      severity: details?.severity ?? 3,
      source: this.config.sourceId,
      action,
      outcome,
      actor: details?.actor,
      transactionHash: details?.transactionHash,
      intentHash: details?.intentHash,
      settlementId: details?.settlementId,
      details: details?.additionalDetails,
    });
  }

  /**
   * Log an authentication event
   */
  public async logAuthEvent(
    action: string,
    actor: string,
    outcome: 'success' | 'failure' | 'unknown',
    details?: Record<string, unknown>
  ): Promise<EventResponse | null> {
    return this.submitEvent({
      name: `auth_${action}`,
      category: 'authentication',
      severity: outcome === 'failure' ? 6 : 3,
      source: this.config.sourceId,
      action,
      outcome,
      actor,
      details,
      mitreTactic: outcome === 'failure' ? 'credential_access' : undefined,
    });
  }

  /**
   * Log an authorization/access control event
   */
  public async logAccessEvent(
    resource: string,
    actor: string,
    allowed: boolean,
    details?: Record<string, unknown>
  ): Promise<EventResponse | null> {
    return this.submitEvent({
      name: 'access_control',
      category: 'authorization',
      severity: allowed ? 2 : 5,
      source: this.config.sourceId,
      destination: resource,
      action: 'access_request',
      outcome: allowed ? 'success' : 'failure',
      actor,
      details,
    });
  }

  /**
   * Log a policy violation event
   */
  public async logPolicyViolation(
    policyName: string,
    actor: string,
    resource: string,
    details?: Record<string, unknown>
  ): Promise<EventResponse | null> {
    return this.submitEvent({
      name: 'policy_violation',
      category: 'policy_violation',
      severity: 7,
      source: this.config.sourceId,
      destination: resource,
      action: `violated_${policyName}`,
      outcome: 'failure',
      actor,
      details,
      mitreTactic: 'defense_evasion',
    });
  }

  /**
   * Log a threat detection event
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
      additionalDetails?: Record<string, unknown>;
    }
  ): Promise<EventResponse | null> {
    return this.submitEvent({
      name: threatName,
      category: 'threat_detection',
      severity,
      source: details.source || this.config.sourceId,
      destination: details.destination,
      action: 'threat_detected',
      outcome: 'unknown',
      actor: details.actor,
      mitreTactic: details.mitreTactic,
      mitreTechnique: details.mitreTechnique,
      details: details.additionalDetails,
    });
  }

  /**
   * Log a settlement-related event
   */
  public async logSettlementEvent(
    action: string,
    settlementId: string,
    outcome: 'success' | 'failure' | 'unknown',
    details?: {
      actor?: string;
      intentHashes?: string[];
      transactionHash?: string;
      additionalDetails?: Record<string, unknown>;
    }
  ): Promise<EventResponse | null> {
    return this.submitEvent({
      name: `settlement_${action}`,
      category: 'blockchain',
      severity: outcome === 'failure' ? 5 : 3,
      source: this.config.sourceId,
      action,
      outcome,
      actor: details?.actor,
      settlementId,
      transactionHash: details?.transactionHash,
      details: {
        intentHashes: details?.intentHashes,
        ...details?.additionalDetails,
      },
    });
  }

  /**
   * Query events from the SIEM
   */
  public async queryEvents(filters: EventQueryFilters = {}): Promise<SecurityEvent[]> {
    try {
      const response = await this.retryRequest(() =>
        this.client.get('/api/v1/events', { params: filters })
      );
      return response.data.events || [];
    } catch (error) {
      logger.error('Failed to query events from SIEM', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get active alerts from the SIEM
   */
  public async getAlerts(
    filters?: {
      severity?: SIEMSeverity;
      category?: EventCategory;
      status?: SIEMAlert['status'];
      limit?: number;
    }
  ): Promise<SIEMAlert[]> {
    try {
      const response = await this.retryRequest(() =>
        this.client.get('/api/v1/alerts', { params: filters })
      );
      return response.data.alerts || [];
    } catch (error) {
      logger.error('Failed to get alerts from SIEM', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Acknowledge an alert
   */
  public async acknowledgeAlert(alertId: string): Promise<boolean> {
    try {
      await this.retryRequest(() =>
        this.client.post(`/api/v1/alerts/${alertId}/acknowledge`)
      );
      return true;
    } catch (error) {
      logger.error('Failed to acknowledge alert', {
        alertId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Enrich an event with default values and metadata
   */
  private enrichEvent(event: SecurityEvent): SecurityEvent {
    return {
      ...event,
      source: event.source || this.config.sourceId,
      timestamp: event.timestamp || Date.now(),
    };
  }

  /**
   * Send a single event to the SIEM
   */
  private async sendEvent(event: SecurityEvent): Promise<EventResponse | null> {
    try {
      const response = await this.retryRequest(() =>
        this.client.post('/api/v1/events', event)
      );

      logger.debug('Event submitted to Boundary SIEM', {
        eventId: response.data.eventId,
        name: event.name,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to submit event to SIEM', {
        name: event.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Start the batch flush timer
   */
  private startBatchFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.eventBatch.length > 0) {
        this.flushEvents().catch(err => {
          logger.error('Failed to flush event batch', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      }
    }, this.config.batchFlushInterval);
  }

  /**
   * Flush queued events to the SIEM
   */
  public async flushEvents(): Promise<void> {
    if (this.eventBatch.length === 0) return;

    const eventsToSend = [...this.eventBatch];
    this.eventBatch = [];

    await this.submitEvents(eventsToSend);
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

      const delay = Math.pow(2, attempt) * 100;
      await new Promise(resolve => setTimeout(resolve, delay));

      return this.retryRequest(requestFn, attempt + 1);
    }
  }

  /**
   * Disconnect from the SIEM and flush remaining events
   */
  public async disconnect(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining events
    await this.flushEvents();

    this.connected = false;
    logger.info('Disconnected from Boundary SIEM');
  }

  /**
   * Get health check status for monitoring
   */
  public async healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    try {
      const response = await this.client.get('/api/v1/health', { timeout: 2000 });
      return {
        healthy: response.status === 200,
        details: {
          connected: true,
          queuedEvents: this.eventBatch.length,
          lastCheck: Date.now(),
        },
      };
    } catch {
      return {
        healthy: false,
        details: {
          connected: false,
          queuedEvents: this.eventBatch.length,
          lastCheck: Date.now(),
        },
      };
    }
  }
}
