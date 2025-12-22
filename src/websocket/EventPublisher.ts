import { randomBytes } from 'crypto';
import { WebSocketServer } from './WebSocketServer';
import {
  WebSocketMessage,
  WebSocketEventType,
  WebSocketConnection,
  WebSocketSubscription,
  IntentEventPayload,
  SettlementEventPayload,
  MP05SettlementEventPayload,
  MP05CapitalizationEventPayload,
  ReceiptEventPayload,
  DisputeEventPayload,
  LicenseEventPayload,
  DelegationEventPayload,
  BurnEventPayload,
  ChallengeEventPayload,
  ReputationEventPayload,
  VerificationEventPayload,
  SystemEventPayload,
  MetricsEventPayload,
} from '../types';
import { logger } from '../utils/logger';

/**
 * Type union for all event payloads
 */
export type EventPayload =
  | IntentEventPayload
  | SettlementEventPayload
  | MP05SettlementEventPayload
  | MP05CapitalizationEventPayload
  | ReceiptEventPayload
  | DisputeEventPayload
  | LicenseEventPayload
  | DelegationEventPayload
  | BurnEventPayload
  | ChallengeEventPayload
  | ReputationEventPayload
  | VerificationEventPayload
  | SystemEventPayload
  | MetricsEventPayload;

/**
 * Event publisher for broadcasting events to subscribed WebSocket clients
 *
 * Handles intelligent routing based on subscriptions and filters
 */
export class EventPublisher {
  private wsServer: WebSocketServer;
  private eventQueue: WebSocketMessage[] = [];
  private processing: boolean = false;
  private batchSize: number = 10;
  private batchInterval: number = 100; // ms
  private stats: {
    totalPublished: number;
    totalFiltered: number;
    publishedByType: Record<string, number>;
    lastPublishTime: number;
  };

  constructor(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
    this.stats = {
      totalPublished: 0,
      totalFiltered: 0,
      publishedByType: {},
      lastPublishTime: 0,
    };
  }

  /**
   * Publish an event to all subscribed clients
   */
  public publish(type: WebSocketEventType, payload: EventPayload): void {
    const message: WebSocketMessage = {
      type,
      timestamp: Date.now(),
      eventId: this.generateEventId(),
      version: '1.0',
      payload,
    };

    // Add to queue
    this.eventQueue.push(message);

    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process event queue in batches
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.eventQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.eventQueue.length > 0) {
      const batch = this.eventQueue.splice(0, this.batchSize);

      for (const message of batch) {
        this.publishMessage(message);
      }

      // Small delay between batches to prevent overwhelming
      if (this.eventQueue.length > 0) {
        await this.sleep(this.batchInterval);
      }
    }

    this.processing = false;
  }

  /**
   * Publish a single message to subscribed clients
   */
  private publishMessage(message: WebSocketMessage): void {
    const connections = this.wsServer.getConnections();
    const targetConnections: string[] = [];

    for (const connection of connections) {
      // Only send to authenticated connections
      if (!connection.authenticated) {
        continue;
      }

      // Check if any subscription matches this event
      for (const subscription of connection.subscriptions) {
        if (this.matchesSubscription(message, subscription, connection)) {
          targetConnections.push(connection.connectionId);
          break; // Only need one matching subscription
        }
      }
    }

    // Broadcast to matching connections
    if (targetConnections.length > 0) {
      this.wsServer.broadcast(message, targetConnections);

      // Update stats
      this.stats.totalPublished++;
      this.stats.publishedByType[message.type] =
        (this.stats.publishedByType[message.type] || 0) + targetConnections.length;
      this.stats.lastPublishTime = Date.now();

      logger.debug('Event published', {
        eventType: message.type,
        eventId: message.eventId,
        targetConnections: targetConnections.length,
      });
    } else {
      this.stats.totalFiltered++;

      logger.debug('Event filtered (no subscribers)', {
        eventType: message.type,
        eventId: message.eventId,
      });
    }
  }

  /**
   * Check if a message matches a subscription
   */
  private matchesSubscription(
    message: WebSocketMessage,
    subscription: WebSocketSubscription,
    connection: WebSocketConnection
  ): boolean {
    // Check if event type is in subscribed topics
    if (!subscription.topics.includes(message.type)) {
      return false;
    }

    // If no filters, subscription matches
    if (!subscription.filters) {
      return true;
    }

    const { payload } = message;
    const { filters } = subscription;

    // Filter by parties
    if (filters.parties && filters.parties.length > 0) {
      const parties = this.extractParties(message);
      const hasMatchingParty = parties.some((party) =>
        filters.parties!.includes(party)
      );

      if (!hasMatchingParty) {
        return false;
      }
    }

    // Filter by intent hashes
    if (filters.intentHashes && filters.intentHashes.length > 0) {
      const intentHashes = this.extractIntentHashes(message);
      const hasMatchingIntent = intentHashes.some((hash) =>
        filters.intentHashes!.includes(hash)
      );

      if (!hasMatchingIntent) {
        return false;
      }
    }

    // Filter by settlement IDs
    if (filters.settlementIds && filters.settlementIds.length > 0) {
      const settlementIds = this.extractSettlementIds(message);
      const hasMatchingSettlement = settlementIds.some((id) =>
        filters.settlementIds!.includes(id)
      );

      if (!hasMatchingSettlement) {
        return false;
      }
    }

    // Filter by receipt IDs
    if (filters.receiptIds && filters.receiptIds.length > 0) {
      const receiptIds = this.extractReceiptIds(message);
      const hasMatchingReceipt = receiptIds.some((id) =>
        filters.receiptIds!.includes(id)
      );

      if (!hasMatchingReceipt) {
        return false;
      }
    }

    // Filter by dispute IDs
    if (filters.disputeIds && filters.disputeIds.length > 0) {
      const disputeIds = this.extractDisputeIds(message);
      const hasMatchingDispute = disputeIds.some((id) =>
        filters.disputeIds!.includes(id)
      );

      if (!hasMatchingDispute) {
        return false;
      }
    }

    // Filter by license IDs
    if (filters.licenseIds && filters.licenseIds.length > 0) {
      const licenseIds = this.extractLicenseIds(message);
      const hasMatchingLicense = licenseIds.some((id) =>
        filters.licenseIds!.includes(id)
      );

      if (!hasMatchingLicense) {
        return false;
      }
    }

    // Filter by delegation IDs
    if (filters.delegationIds && filters.delegationIds.length > 0) {
      const delegationIds = this.extractDelegationIds(message);
      const hasMatchingDelegation = delegationIds.some((id) =>
        filters.delegationIds!.includes(id)
      );

      if (!hasMatchingDelegation) {
        return false;
      }
    }

    // Filter by severity (for risk/violation events)
    if (filters.minSeverity) {
      const severity = this.extractSeverity(message);
      if (severity && !this.meetsSeverityThreshold(severity, filters.minSeverity)) {
        return false;
      }
    }

    // All filters passed
    return true;
  }

  /**
   * Extract party identities from event payload
   */
  private extractParties(message: WebSocketMessage): string[] {
    const parties: string[] = [];
    const { payload, type } = message;

    // Intent events
    if (type.startsWith('intent.')) {
      const p = payload as IntentEventPayload;
      if (p.intent?.author) parties.push(p.intent.author);
    }

    // Settlement events
    if (type.startsWith('settlement.')) {
      const p = payload as SettlementEventPayload;
      if (p.settlement) {
        // Extract parties from intent hashes (would need to look up intents)
        // For now, just include the mediator
        if (p.settlement.mediatorId) parties.push(p.settlement.mediatorId);
      }
      if (p.party) parties.push(p.party);
    }

    // MP-05 Settlement events
    if (type.startsWith('mp05.settlement.')) {
      const p = payload as MP05SettlementEventPayload;
      if (p.settlement) {
        parties.push(...p.settlement.requiredParties);
        if (p.settlement.initiatedBy) parties.push(p.settlement.initiatedBy);
      }
      if (p.declaringParty) parties.push(p.declaringParty);
    }

    // Receipt events
    if (type.startsWith('receipt.')) {
      const p = payload as ReceiptEventPayload;
      if (p.receipt) {
        // Receipts have observerId and validatorId but no direct counterparties
        if (p.receipt.observerId) parties.push(p.receipt.observerId);
        if (p.receipt.validatorId) parties.push(p.receipt.validatorId);
      }
    }

    // Dispute events
    if (type.startsWith('dispute.')) {
      const p = payload as DisputeEventPayload;
      if (p.dispute) {
        if (p.dispute.claimant?.partyId) parties.push(p.dispute.claimant.partyId);
        if (p.dispute.respondent?.partyId) parties.push(p.dispute.respondent.partyId);
      }
    }

    // License events
    if (type.startsWith('license.')) {
      const p = payload as LicenseEventPayload;
      if (p.license) {
        if (p.license.grantorId) parties.push(p.license.grantorId);
        if (p.license.granteeId) parties.push(p.license.granteeId);
      }
    }

    // Delegation events
    if (type.startsWith('delegation.')) {
      const p = payload as DelegationEventPayload;
      if (p.delegation) {
        if (p.delegation.delegatorId) parties.push(p.delegation.delegatorId);
        if (p.delegation.delegateId) parties.push(p.delegation.delegateId);
      }
    }

    // Burn events
    if (type.startsWith('burn.')) {
      const p = payload as BurnEventPayload;
      if (p.burn?.author) parties.push(p.burn.author);
    }

    // Challenge events
    if (type.startsWith('challenge.')) {
      const p = payload as ChallengeEventPayload;
      if (p.challenge?.challengerId) parties.push(p.challenge.challengerId);
    }

    // Reputation events
    if (type.startsWith('reputation.')) {
      const p = payload as ReputationEventPayload;
      if (p.reputation?.mediatorId) parties.push(p.reputation.mediatorId);
    }

    return parties;
  }

  /**
   * Extract intent hashes from event payload
   */
  private extractIntentHashes(message: WebSocketMessage): string[] {
    const hashes: string[] = [];
    const { payload, type } = message;

    if (type.startsWith('intent.')) {
      const p = payload as IntentEventPayload;
      if (p.intent?.hash) hashes.push(p.intent.hash);
    }

    if (type.startsWith('settlement.')) {
      const p = payload as SettlementEventPayload;
      if (p.settlement) {
        if (p.settlement.intentHashA) hashes.push(p.settlement.intentHashA);
        if (p.settlement.intentHashB) hashes.push(p.settlement.intentHashB);
      }
    }

    return hashes;
  }

  /**
   * Extract settlement IDs from event payload
   */
  private extractSettlementIds(message: WebSocketMessage): string[] {
    const ids: string[] = [];
    const { payload, type } = message;

    if (type.startsWith('settlement.')) {
      const p = payload as SettlementEventPayload;
      if (p.settlement?.id) ids.push(p.settlement.id);
    }

    if (type.startsWith('mp05.settlement.') || type.startsWith('mp05.capitalization.')) {
      const p = payload as MP05SettlementEventPayload | MP05CapitalizationEventPayload;
      if ('settlement' in p && p.settlement?.settlementId) {
        ids.push(p.settlement.settlementId);
      }
      if ('settlementId' in p && p.settlementId) {
        ids.push(p.settlementId);
      }
    }

    if (type.startsWith('verification.')) {
      const p = payload as VerificationEventPayload;
      if (p.settlementId) ids.push(p.settlementId);
    }

    return ids;
  }

  /**
   * Extract receipt IDs from event payload
   */
  private extractReceiptIds(message: WebSocketMessage): string[] {
    const ids: string[] = [];
    const { payload, type } = message;

    if (type.startsWith('receipt.')) {
      const p = payload as ReceiptEventPayload;
      if (p.receipt?.receiptId) ids.push(p.receipt.receiptId);
    }

    if (type.startsWith('mp05.settlement.')) {
      const p = payload as MP05SettlementEventPayload;
      if (p.settlement?.referencedReceipts) {
        ids.push(...p.settlement.referencedReceipts);
      }
    }

    return ids;
  }

  /**
   * Extract dispute IDs from event payload
   */
  private extractDisputeIds(message: WebSocketMessage): string[] {
    const ids: string[] = [];
    const { payload, type } = message;

    if (type.startsWith('dispute.')) {
      const p = payload as DisputeEventPayload;
      if (p.dispute?.disputeId) ids.push(p.dispute.disputeId);
    }

    if (type.startsWith('mp05.settlement.')) {
      const p = payload as MP05SettlementEventPayload;
      if (p.settlement?.disputeId) ids.push(p.settlement.disputeId);
    }

    return ids;
  }

  /**
   * Extract license IDs from event payload
   */
  private extractLicenseIds(message: WebSocketMessage): string[] {
    const ids: string[] = [];
    const { payload, type } = message;

    if (type.startsWith('license.')) {
      const p = payload as LicenseEventPayload;
      if (p.license?.licenseId) ids.push(p.license.licenseId);
    }

    if (type.startsWith('mp05.settlement.')) {
      const p = payload as MP05SettlementEventPayload;
      if (p.settlement?.referencedLicenses) {
        ids.push(...p.settlement.referencedLicenses);
      }
    }

    return ids;
  }

  /**
   * Extract delegation IDs from event payload
   */
  private extractDelegationIds(message: WebSocketMessage): string[] {
    const ids: string[] = [];
    const { payload, type } = message;

    if (type.startsWith('delegation.')) {
      const p = payload as DelegationEventPayload;
      if (p.delegation?.delegationId) ids.push(p.delegation.delegationId);
    }

    if (type.startsWith('mp05.settlement.')) {
      const p = payload as MP05SettlementEventPayload;
      if (p.settlement?.referencedDelegations) {
        ids.push(...p.settlement.referencedDelegations);
      }
    }

    return ids;
  }

  /**
   * Extract severity from event payload
   */
  private extractSeverity(message: WebSocketMessage): 'low' | 'medium' | 'high' | null {
    // ScopeViolation doesn't currently have a severity field
    // This could be extended in the future if needed
    return null;
  }

  /**
   * Check if severity meets threshold
   */
  private meetsSeverityThreshold(
    severity: 'low' | 'medium' | 'high',
    minSeverity: 'low' | 'medium' | 'high'
  ): boolean {
    const levels = { low: 1, medium: 2, high: 3 };
    return levels[severity] >= levels[minSeverity];
  }

  /**
   * Get publisher statistics
   */
  public getStatistics(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.stats = {
      totalPublished: 0,
      totalFiltered: 0,
      publishedByType: {},
      lastPublishTime: 0,
    };
  }

  /**
   * Get event queue size
   */
  public getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt-${Date.now()}-${randomBytes(6).toString('hex')}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
