import {
  MediatorConfig,
  DisputeDeclaration,
  DisputeParty,
  ContestedItem,
  DisputeEvidence,
  DisputeStatus,
  DisputeTimelineEntry,
} from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logger } from '../utils/logger';
import { EvidenceManager } from './EvidenceManager';
import { ClarificationManager } from './ClarificationManager';

/**
 * Manages dispute declarations and lifecycle
 * Handles initiation, evidence tracking, and status updates
 */
export class DisputeManager {
  private config: MediatorConfig;
  private disputes: Map<string, DisputeDeclaration> = new Map();
  private dataPath: string;
  private evidenceManager: EvidenceManager;
  private clarificationManager?: ClarificationManager;
  private llmProvider?: LLMProvider;

  constructor(
    config: MediatorConfig,
    llmProvider?: LLMProvider,
    dataPath: string = './data/disputes',
    evidenceDataPath?: string,
    clarificationDataPath?: string
  ) {
    this.config = config;
    this.llmProvider = llmProvider;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Initialize evidence manager with matching test path if in test environment
    const evidencePath = evidenceDataPath ||
      (dataPath.includes('test-data') ? dataPath.replace('disputes', 'evidence') : undefined);
    this.evidenceManager = new EvidenceManager(config, evidencePath);

    // Initialize clarification manager if LLM provider is available
    if (llmProvider && config.allowDisputeClarification !== false) {
      const clarificationPath = clarificationDataPath ||
        (dataPath.includes('test-data') ? dataPath.replace('disputes', 'clarifications') : undefined);
      this.clarificationManager = new ClarificationManager(config, llmProvider, clarificationPath);
    }

    // Load existing disputes
    this.loadDisputes();

    logger.info('DisputeManager initialized', {
      dataPath,
      disputesLoaded: this.disputes.size,
    });
  }

  /**
   * Initiate a new dispute
   */
  public async initiateDispute(params: {
    claimantId: string;
    claimantName?: string;
    contestedItems: ContestedItem[];
    issueDescription: string;
    respondentId?: string;
    respondentName?: string;
    desiredEscalationPath?: string;
  }): Promise<{
    success: boolean;
    disputeId?: string;
    error?: string;
  }> {
    try {
      // Validate contested items exist
      const validation = await this.validateContestedItems(params.contestedItems);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid contested items: ${validation.errors.join(', ')}`,
        };
      }

      // Create dispute declaration
      const disputeId = nanoid();
      const now = Date.now();

      const claimant: DisputeParty = {
        partyId: params.claimantId,
        role: 'claimant',
        name: params.claimantName,
      };

      const respondent: DisputeParty | undefined = params.respondentId
        ? {
            partyId: params.respondentId,
            role: 'respondent',
            name: params.respondentName,
          }
        : undefined;

      const dispute: DisputeDeclaration = {
        disputeId,
        claimant,
        respondent,
        contestedItems: params.contestedItems,
        issueDescription: params.issueDescription,
        desiredEscalationPath: params.desiredEscalationPath,
        status: 'initiated',
        initiatedAt: now,
        updatedAt: now,
        evidence: [],
      };

      // Store dispute
      this.disputes.set(disputeId, dispute);
      this.saveDispute(dispute);

      // Submit to chain
      const submitted = await this.submitDisputeToChain(dispute);

      if (!submitted) {
        logger.warn('Failed to submit dispute to chain', { disputeId });
      }

      // Freeze contested items if enabled
      await this.evidenceManager.autoFreezeIfEnabled(
        disputeId,
        params.contestedItems,
        params.claimantId
      );

      logger.info('Dispute initiated', {
        disputeId,
        claimant: params.claimantId,
        respondent: params.respondentId,
        contestedItems: params.contestedItems.length,
      });

      return {
        success: true,
        disputeId,
      };
    } catch (error) {
      logger.error('Error initiating dispute', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Validate that contested items exist
   */
  private async validateContestedItems(
    items: ContestedItem[]
  ): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    for (const item of items) {
      // In a real implementation, this would check the chain/database
      // For now, we'll do basic validation
      if (!item.itemId || !item.itemType) {
        errors.push(`Missing itemId or itemType for item`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Submit dispute to chain
   */
  private async submitDisputeToChain(
    dispute: DisputeDeclaration
  ): Promise<boolean> {
    try {
      const prose = this.formatDisputeAsProse(dispute);

      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/disputes`,
        {
          type: 'dispute_declaration',
          dispute: {
            disputeId: dispute.disputeId,
            claimant: dispute.claimant.partyId,
            respondent: dispute.respondent?.partyId,
            contestedItems: dispute.contestedItems,
            issueDescription: dispute.issueDescription,
            status: dispute.status,
            initiatedAt: dispute.initiatedAt,
          },
          prose,
        }
      );

      return response.status === 200 || response.status === 201;
    } catch (error) {
      logger.error('Error submitting dispute to chain', { error });
      return false;
    }
  }

  /**
   * Format dispute as prose entry
   */
  private formatDisputeAsProse(dispute: DisputeDeclaration): string {
    const items = dispute.contestedItems
      .map((item) => `${item.itemType}: ${item.itemId}`)
      .join('\n');

    return `[DISPUTE DECLARATION]

Dispute ID: ${dispute.disputeId}
Status: ${dispute.status}

**Claimant:**
${dispute.claimant.partyId}${dispute.claimant.name ? ` (${dispute.claimant.name})` : ''}

${dispute.respondent ? `**Respondent:**\n${dispute.respondent.partyId}${dispute.respondent.name ? ` (${dispute.respondent.name})` : ''}` : '**Respondent:** To be determined'}

**Contested Items:**
${items}

**Issue Description:**
${dispute.issueDescription}

${dispute.desiredEscalationPath ? `**Desired Escalation Path:**\n${dispute.desiredEscalationPath}` : ''}

**Timeline:**
Initiated: ${new Date(dispute.initiatedAt).toISOString()}

This dispute declaration is recorded for preservation of evidence and escalation purposes.
No automated judgment is rendered by this system.
`;
  }

  /**
   * Add evidence to a dispute
   */
  public async addEvidence(params: {
    disputeId: string;
    submittedBy: string;
    evidenceType: 'document' | 'statement' | 'witness' | 'artifact' | 'other';
    description: string;
    contentHash?: string;
    linkedItems?: string[];
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    evidenceId?: string;
    error?: string;
  }> {
    const dispute = this.disputes.get(params.disputeId);

    if (!dispute) {
      return {
        success: false,
        error: 'Dispute not found',
      };
    }

    const evidenceId = nanoid();
    const evidence: DisputeEvidence = {
      evidenceId,
      disputeId: params.disputeId,
      submittedBy: params.submittedBy,
      timestamp: Date.now(),
      evidenceType: params.evidenceType,
      description: params.description,
      contentHash: params.contentHash,
      linkedItems: params.linkedItems,
      metadata: params.metadata,
    };

    dispute.evidence.push(evidence);
    dispute.updatedAt = Date.now();

    this.saveDispute(dispute);

    logger.info('Evidence added to dispute', {
      disputeId: params.disputeId,
      evidenceId,
      evidenceType: params.evidenceType,
    });

    return {
      success: true,
      evidenceId,
    };
  }

  /**
   * Update dispute status
   */
  public updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus
  ): boolean {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      logger.warn('Dispute not found for status update', { disputeId });
      return false;
    }

    dispute.status = status;
    dispute.updatedAt = Date.now();

    this.saveDispute(dispute);

    logger.info('Dispute status updated', { disputeId, status });

    return true;
  }

  /**
   * Get dispute by ID
   */
  public getDispute(disputeId: string): DisputeDeclaration | undefined {
    return this.disputes.get(disputeId);
  }

  /**
   * Get all disputes
   */
  public getAllDisputes(): DisputeDeclaration[] {
    return Array.from(this.disputes.values());
  }

  /**
   * Get disputes by status
   */
  public getDisputesByStatus(status: DisputeStatus): DisputeDeclaration[] {
    return Array.from(this.disputes.values()).filter((d) => d.status === status);
  }

  /**
   * Get disputes involving a party
   */
  public getDisputesByParty(partyId: string): DisputeDeclaration[] {
    return Array.from(this.disputes.values()).filter(
      (d) =>
        d.claimant.partyId === partyId || d.respondent?.partyId === partyId
    );
  }

  /**
   * Get dispute timeline
   */
  public getDisputeTimeline(disputeId: string): DisputeTimelineEntry[] {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      return [];
    }

    const timeline: DisputeTimelineEntry[] = [];

    // Initiation
    timeline.push({
      timestamp: dispute.initiatedAt,
      eventType: 'initiated',
      actor: dispute.claimant.partyId,
      description: 'Dispute initiated',
      referenceId: dispute.disputeId,
    });

    // Evidence additions
    for (const evidence of dispute.evidence) {
      timeline.push({
        timestamp: evidence.timestamp,
        eventType: 'evidence_added',
        actor: evidence.submittedBy,
        description: `Evidence added: ${evidence.evidenceType}`,
        referenceId: evidence.evidenceId,
      });
    }

    // Clarification
    if (dispute.clarificationRecord) {
      timeline.push({
        timestamp: dispute.clarificationRecord.startedAt,
        eventType: 'clarification_started',
        actor: dispute.clarificationRecord.mediatorId,
        description: 'Clarification phase started',
        referenceId: dispute.clarificationRecord.clarificationId,
      });

      if (dispute.clarificationRecord.completedAt) {
        timeline.push({
          timestamp: dispute.clarificationRecord.completedAt,
          eventType: 'clarification_completed',
          actor: dispute.clarificationRecord.mediatorId,
          description: 'Clarification phase completed',
          referenceId: dispute.clarificationRecord.clarificationId,
        });
      }
    }

    // Escalation
    if (dispute.escalation) {
      timeline.push({
        timestamp: dispute.escalation.escalatedAt,
        eventType: 'escalated',
        actor: dispute.escalation.escalatedBy,
        description: `Escalated to ${dispute.escalation.targetAuthority.name}`,
        referenceId: dispute.escalation.escalationId,
      });
    }

    // Resolution
    if (dispute.resolution) {
      timeline.push({
        timestamp: dispute.resolution.resolvedAt,
        eventType: 'resolved',
        actor: dispute.resolution.resolvedBy,
        description: `Resolved: ${dispute.resolution.outcome}`,
        referenceId: dispute.resolution.resolutionId,
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    return timeline;
  }

  /**
   * Save dispute to disk
   */
  private saveDispute(dispute: DisputeDeclaration): void {
    const filePath = path.join(this.dataPath, `${dispute.disputeId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(dispute, null, 2));
    } catch (error) {
      logger.error('Error saving dispute', {
        disputeId: dispute.disputeId,
        error,
      });
    }
  }

  /**
   * Load all disputes from disk
   */
  private loadDisputes(): void {
    if (!fs.existsSync(this.dataPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.dataPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.dataPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const dispute: DisputeDeclaration = JSON.parse(content);

        this.disputes.set(dispute.disputeId, dispute);
      }

      logger.info('Disputes loaded from disk', {
        count: this.disputes.size,
      });
    } catch (error) {
      logger.error('Error loading disputes', { error });
    }
  }

  /**
   * Check if an item is frozen due to a dispute
   */
  public isItemFrozen(itemId: string): boolean {
    return this.evidenceManager.isItemFrozen(itemId);
  }

  /**
   * Check if an item can be mutated
   */
  public canMutateItem(
    itemId: string,
    operationType: 'update' | 'delete'
  ): { allowed: boolean; reason?: string; disputeId?: string } {
    return this.evidenceManager.canMutateItem(itemId, operationType);
  }

  /**
   * Record a mutation attempt for audit purposes
   */
  public recordMutationAttempt(
    itemId: string,
    attemptedBy: string,
    operationType: 'update' | 'delete'
  ): void {
    this.evidenceManager.recordMutationAttempt(
      itemId,
      attemptedBy,
      operationType
    );
  }

  /**
   * Create an evidence snapshot for a dispute
   */
  public async createEvidenceSnapshot(disputeId: string) {
    return this.evidenceManager.createEvidenceSnapshot(disputeId);
  }

  /**
   * Resolve a dispute and unfreeze associated items
   */
  public async resolveDispute(
    disputeId: string,
    outcome: string,
    resolvedBy: string
  ): Promise<boolean> {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      logger.warn('Dispute not found for resolution', { disputeId });
      return false;
    }

    // Update dispute status
    dispute.status = 'resolved';
    dispute.updatedAt = Date.now();
    dispute.resolution = {
      resolutionId: nanoid(),
      disputeId,
      outcome: 'other',
      outcomeDescription: outcome,
      resolvedBy,
      resolvedAt: Date.now(),
      isImmutable: true,
    };

    this.saveDispute(dispute);

    // Unfreeze contested items
    const unfrozenCount = this.evidenceManager.unfreezeItemsForDispute(disputeId);

    logger.info('Dispute resolved', {
      disputeId,
      outcome,
      unfrozenCount,
    });

    return true;
  }

  /**
   * Dismiss a dispute and unfreeze associated items
   */
  public async dismissDispute(
    disputeId: string,
    reason: string,
    dismissedBy: string
  ): Promise<boolean> {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      logger.warn('Dispute not found for dismissal', { disputeId });
      return false;
    }

    // Update dispute status
    dispute.status = 'dismissed';
    dispute.updatedAt = Date.now();
    dispute.resolution = {
      resolutionId: nanoid(),
      disputeId,
      outcome: 'dismissed',
      outcomeDescription: reason,
      resolvedBy: dismissedBy,
      resolvedAt: Date.now(),
      isImmutable: true,
    };

    this.saveDispute(dispute);

    // Unfreeze contested items
    const unfrozenCount = this.evidenceManager.unfreezeItemsForDispute(disputeId);

    logger.info('Dispute dismissed', {
      disputeId,
      reason,
      unfrozenCount,
    });

    return true;
  }

  /**
   * Initiate clarification phase for a dispute
   */
  public async initiateClarification(params: {
    disputeId: string;
    claimantConsent: boolean;
    respondentConsent: boolean;
  }): Promise<{
    success: boolean;
    clarificationId?: string;
    error?: string;
  }> {
    if (!this.clarificationManager) {
      return {
        success: false,
        error: 'Clarification system not available (requires LLM provider)',
      };
    }

    const dispute = this.disputes.get(params.disputeId);

    if (!dispute) {
      return {
        success: false,
        error: 'Dispute not found',
      };
    }

    // Determine mediator ID (use LLM provider name or config)
    const mediatorId = this.llmProvider?.constructor.name || 'default-mediator';

    const result = await this.clarificationManager.initiateClarification({
      ...params,
      mediatorId,
    });

    if (result.success) {
      // Update dispute status to clarifying
      this.updateDisputeStatus(params.disputeId, 'clarifying');
    }

    return result;
  }

  /**
   * Submit a clarification statement
   */
  public async submitClarificationStatement(params: {
    clarificationId: string;
    submittedBy: string;
    statementType: 'claim' | 'counterclaim' | 'response';
    content: string;
    references?: string[];
  }) {
    if (!this.clarificationManager) {
      return {
        success: false,
        error: 'Clarification system not available',
      };
    }

    return this.clarificationManager.submitStatement(params);
  }

  /**
   * Analyze clarification progress
   */
  public async analyzeClarification(clarificationId: string) {
    if (!this.clarificationManager) {
      return null;
    }

    return this.clarificationManager.analyzeClarification(clarificationId);
  }

  /**
   * Complete clarification phase
   */
  public completeClarification(clarificationId: string) {
    if (!this.clarificationManager) {
      return {
        success: false,
        error: 'Clarification system not available',
      };
    }

    return this.clarificationManager.completeClarification(clarificationId);
  }

  /**
   * Get clarification for dispute
   */
  public getClarificationsForDispute(disputeId: string) {
    if (!this.clarificationManager) {
      return [];
    }

    return this.clarificationManager.getClarificationsForDispute(disputeId);
  }

  /**
   * Get clarification manager (for testing/advanced usage)
   */
  public getClarificationManager(): ClarificationManager | undefined {
    return this.clarificationManager;
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalDisputes: number;
    disputesByStatus: Record<DisputeStatus, number>;
    totalEvidence: number;
    averageEvidencePerDispute: number;
    evidenceStats?: ReturnType<EvidenceManager['getStats']>;
    clarificationStats?: ReturnType<ClarificationManager['getStats']>;
  } {
    const disputesByStatus: Record<DisputeStatus, number> = {
      initiated: 0,
      under_review: 0,
      clarifying: 0,
      escalated: 0,
      resolved: 0,
      dismissed: 0,
    };

    let totalEvidence = 0;

    for (const dispute of this.disputes.values()) {
      disputesByStatus[dispute.status]++;
      totalEvidence += dispute.evidence.length;
    }

    return {
      totalDisputes: this.disputes.size,
      disputesByStatus,
      totalEvidence,
      averageEvidencePerDispute:
        this.disputes.size > 0
          ? Math.round((totalEvidence / this.disputes.size) * 10) / 10
          : 0,
      evidenceStats: this.evidenceManager.getStats(),
      clarificationStats: this.clarificationManager?.getStats(),
    };
  }
}
