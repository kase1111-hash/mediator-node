import {
  MediatorConfig,
  DisputeResolution,
  DisputeDeclaration,
} from '../types';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import axios from 'axios';

/**
 * Outcome recording options
 */
export interface OutcomeRecordingOptions {
  externalReferences?: string[];
  reputationImpact?: {
    claimant: number;
    respondent: number;
  };
  annotations?: string[];
  publishToChain?: boolean;
}

/**
 * Authority decision details
 */
export interface AuthorityDecision {
  authorityId: string;
  authorityName: string;
  ruling: string;
  reasoningDocument?: string;
  appealable: boolean;
  appealDeadline?: number;
}

/**
 * Settlement details
 */
export interface SettlementDetails {
  terms: string[];
  agreedBy: string[];
  mediatorId?: string;
  enforcementMechanism?: string;
}

/**
 * Manages dispute outcome recording and integration
 * Ensures immutability and proper lifecycle integration
 */
export class OutcomeRecorder {
  private config: MediatorConfig;
  private outcomes: Map<string, DisputeResolution> = new Map();
  private dataPath: string;

  constructor(config: MediatorConfig, dataPath: string = './data/outcomes') {
    this.config = config;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing outcomes
    this.loadOutcomes();

    logger.info('OutcomeRecorder initialized', {
      dataPath,
      outcomesLoaded: this.outcomes.size,
    });
  }

  /**
   * Record an authority decision outcome
   */
  public async recordAuthorityDecision(params: {
    disputeId: string;
    authorityDecision: AuthorityDecision;
    outcome: 'claimant_favored' | 'respondent_favored' | 'compromise' | 'dismissed' | 'other';
    outcomeDescription: string;
    options?: OutcomeRecordingOptions;
  }): Promise<{
    success: boolean;
    resolutionId?: string;
    error?: string;
  }> {
    try {
      // Check if dispute already has a resolution
      const existingResolution = this.getOutcomeForDispute(params.disputeId);
      if (existingResolution) {
        return {
          success: false,
          error: 'Dispute already has an immutable resolution',
        };
      }

      const resolutionId = nanoid();
      const now = Date.now();

      const resolution: DisputeResolution = {
        resolutionId,
        disputeId: params.disputeId,
        resolvedAt: now,
        resolvedBy: `${params.authorityDecision.authorityName} (${params.authorityDecision.authorityId})`,
        outcome: params.outcome,
        outcomeDescription: this.formatAuthorityDecision(
          params.authorityDecision,
          params.outcomeDescription
        ),
        externalReferences: [
          ...(params.options?.externalReferences || []),
          ...(params.authorityDecision.reasoningDocument
            ? [params.authorityDecision.reasoningDocument]
            : []),
        ],
        reputationImpact: params.options?.reputationImpact,
        annotations: params.options?.annotations,
        isImmutable: true,
      };

      // Store outcome
      this.outcomes.set(resolutionId, resolution);
      this.saveOutcome(resolution);

      // Publish to chain if requested
      if (params.options?.publishToChain !== false) {
        await this.publishToChain(resolution);
      }

      logger.info('Authority decision recorded', {
        resolutionId,
        disputeId: params.disputeId,
        authority: params.authorityDecision.authorityName,
        outcome: params.outcome,
      });

      return {
        success: true,
        resolutionId,
      };
    } catch (error) {
      logger.error('Error recording authority decision', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Record a settlement outcome
   */
  public async recordSettlement(params: {
    disputeId: string;
    settlement: SettlementDetails;
    options?: OutcomeRecordingOptions;
  }): Promise<{
    success: boolean;
    resolutionId?: string;
    error?: string;
  }> {
    try {
      // Check if dispute already has a resolution
      const existingResolution = this.getOutcomeForDispute(params.disputeId);
      if (existingResolution) {
        return {
          success: false,
          error: 'Dispute already has an immutable resolution',
        };
      }

      // Validate settlement has required parties
      if (params.settlement.agreedBy.length < 2) {
        return {
          success: false,
          error: 'Settlement must be agreed by at least two parties',
        };
      }

      const resolutionId = nanoid();
      const now = Date.now();

      const resolvedBy = params.settlement.mediatorId
        ? `Settlement (mediated by ${params.settlement.mediatorId})`
        : 'Settlement (direct agreement)';

      const resolution: DisputeResolution = {
        resolutionId,
        disputeId: params.disputeId,
        resolvedAt: now,
        resolvedBy,
        outcome: 'compromise',
        outcomeDescription: this.formatSettlement(params.settlement),
        externalReferences: params.options?.externalReferences,
        reputationImpact: params.options?.reputationImpact,
        annotations: params.options?.annotations,
        isImmutable: true,
      };

      // Store outcome
      this.outcomes.set(resolutionId, resolution);
      this.saveOutcome(resolution);

      // Publish to chain if requested
      if (params.options?.publishToChain !== false) {
        await this.publishToChain(resolution);
      }

      logger.info('Settlement recorded', {
        resolutionId,
        disputeId: params.disputeId,
        parties: params.settlement.agreedBy.length,
      });

      return {
        success: true,
        resolutionId,
      };
    } catch (error) {
      logger.error('Error recording settlement', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Record a dismissal outcome
   */
  public async recordDismissal(params: {
    disputeId: string;
    dismissedBy: string;
    reason: string;
    options?: OutcomeRecordingOptions;
  }): Promise<{
    success: boolean;
    resolutionId?: string;
    error?: string;
  }> {
    try {
      // Check if dispute already has a resolution
      const existingResolution = this.getOutcomeForDispute(params.disputeId);
      if (existingResolution) {
        return {
          success: false,
          error: 'Dispute already has an immutable resolution',
        };
      }

      const resolutionId = nanoid();
      const now = Date.now();

      const resolution: DisputeResolution = {
        resolutionId,
        disputeId: params.disputeId,
        resolvedAt: now,
        resolvedBy: params.dismissedBy,
        outcome: 'dismissed',
        outcomeDescription: `Dispute dismissed. Reason: ${params.reason}`,
        externalReferences: params.options?.externalReferences,
        reputationImpact: params.options?.reputationImpact,
        annotations: params.options?.annotations,
        isImmutable: true,
      };

      // Store outcome
      this.outcomes.set(resolutionId, resolution);
      this.saveOutcome(resolution);

      // Publish to chain if requested
      if (params.options?.publishToChain !== false) {
        await this.publishToChain(resolution);
      }

      logger.info('Dismissal recorded', {
        resolutionId,
        disputeId: params.disputeId,
        dismissedBy: params.dismissedBy,
      });

      return {
        success: true,
        resolutionId,
      };
    } catch (error) {
      logger.error('Error recording dismissal', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Record withdrawal (one party withdraws their claim)
   */
  public async recordWithdrawal(params: {
    disputeId: string;
    withdrawnBy: string;
    reason?: string;
    options?: OutcomeRecordingOptions;
  }): Promise<{
    success: boolean;
    resolutionId?: string;
    error?: string;
  }> {
    try {
      // Check if dispute already has a resolution
      const existingResolution = this.getOutcomeForDispute(params.disputeId);
      if (existingResolution) {
        return {
          success: false,
          error: 'Dispute already has an immutable resolution',
        };
      }

      const resolutionId = nanoid();
      const now = Date.now();

      const description = params.reason
        ? `Dispute withdrawn by ${params.withdrawnBy}. Reason: ${params.reason}`
        : `Dispute withdrawn by ${params.withdrawnBy}`;

      const resolution: DisputeResolution = {
        resolutionId,
        disputeId: params.disputeId,
        resolvedAt: now,
        resolvedBy: params.withdrawnBy,
        outcome: 'dismissed',
        outcomeDescription: description,
        externalReferences: params.options?.externalReferences,
        reputationImpact: params.options?.reputationImpact,
        annotations: params.options?.annotations,
        isImmutable: true,
      };

      // Store outcome
      this.outcomes.set(resolutionId, resolution);
      this.saveOutcome(resolution);

      // Publish to chain if requested
      if (params.options?.publishToChain !== false) {
        await this.publishToChain(resolution);
      }

      logger.info('Withdrawal recorded', {
        resolutionId,
        disputeId: params.disputeId,
        withdrawnBy: params.withdrawnBy,
      });

      return {
        success: true,
        resolutionId,
      };
    } catch (error) {
      logger.error('Error recording withdrawal', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Format authority decision as prose
   */
  private formatAuthorityDecision(
    decision: AuthorityDecision,
    outcomeDescription: string
  ): string {
    const lines: string[] = [];

    lines.push('[AUTHORITY DECISION]');
    lines.push('');
    lines.push(`Authority: ${decision.authorityName}`);
    lines.push(`Authority ID: ${decision.authorityId}`);
    lines.push('');
    lines.push('**Ruling:**');
    lines.push(decision.ruling);
    lines.push('');
    lines.push('**Outcome:**');
    lines.push(outcomeDescription);
    lines.push('');

    if (decision.reasoningDocument) {
      lines.push(`**Reasoning Document:**`);
      lines.push(decision.reasoningDocument);
      lines.push('');
    }

    lines.push(`**Appealable:** ${decision.appealable ? 'Yes' : 'No'}`);
    if (decision.appealable && decision.appealDeadline) {
      lines.push(
        `**Appeal Deadline:** ${new Date(decision.appealDeadline).toISOString()}`
      );
    }

    return lines.join('\n');
  }

  /**
   * Format settlement as prose
   */
  private formatSettlement(settlement: SettlementDetails): string {
    const lines: string[] = [];

    lines.push('[SETTLEMENT AGREEMENT]');
    lines.push('');
    lines.push('**Agreed Terms:**');
    for (let i = 0; i < settlement.terms.length; i++) {
      lines.push(`${i + 1}. ${settlement.terms[i]}`);
    }
    lines.push('');

    lines.push('**Parties in Agreement:**');
    for (const party of settlement.agreedBy) {
      lines.push(`- ${party}`);
    }
    lines.push('');

    if (settlement.mediatorId) {
      lines.push(`**Mediated By:** ${settlement.mediatorId}`);
      lines.push('');
    }

    if (settlement.enforcementMechanism) {
      lines.push('**Enforcement Mechanism:**');
      lines.push(settlement.enforcementMechanism);
      lines.push('');
    }

    lines.push(
      'This settlement agreement is binding and final upon all parties.'
    );

    return lines.join('\n');
  }

  /**
   * Publish outcome to chain
   */
  private async publishToChain(resolution: DisputeResolution): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/outcomes`,
        {
          type: 'dispute_resolution',
          resolution: {
            resolutionId: resolution.resolutionId,
            disputeId: resolution.disputeId,
            resolvedAt: resolution.resolvedAt,
            resolvedBy: resolution.resolvedBy,
            outcome: resolution.outcome,
            isImmutable: resolution.isImmutable,
          },
          prose: resolution.outcomeDescription,
        }
      );

      logger.info('Outcome published to chain', {
        resolutionId: resolution.resolutionId,
        status: response.status,
      });

      return response.status === 200 || response.status === 201;
    } catch (error) {
      logger.error('Error publishing outcome to chain', { error });
      return false;
    }
  }

  /**
   * Get outcome by resolution ID
   */
  public getOutcome(resolutionId: string): DisputeResolution | undefined {
    return this.outcomes.get(resolutionId);
  }

  /**
   * Get outcome for a dispute
   */
  public getOutcomeForDispute(disputeId: string): DisputeResolution | undefined {
    return Array.from(this.outcomes.values()).find(
      (outcome) => outcome.disputeId === disputeId
    );
  }

  /**
   * Get all outcomes
   */
  public getAllOutcomes(): DisputeResolution[] {
    return Array.from(this.outcomes.values());
  }

  /**
   * Get outcomes by type
   */
  public getOutcomesByType(
    outcomeType: 'claimant_favored' | 'respondent_favored' | 'compromise' | 'dismissed' | 'other'
  ): DisputeResolution[] {
    return Array.from(this.outcomes.values()).filter(
      (outcome) => outcome.outcome === outcomeType
    );
  }

  /**
   * Verify outcome immutability
   */
  public verifyImmutability(resolutionId: string): {
    isImmutable: boolean;
    canModify: boolean;
    reason?: string;
  } {
    const outcome = this.outcomes.get(resolutionId);

    if (!outcome) {
      return {
        isImmutable: false,
        canModify: false,
        reason: 'Outcome not found',
      };
    }

    if (!outcome.isImmutable) {
      return {
        isImmutable: false,
        canModify: true,
        reason: 'Outcome is not marked as immutable',
      };
    }

    return {
      isImmutable: true,
      canModify: false,
      reason: 'Outcome is immutable and cannot be modified',
    };
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalOutcomes: number;
    outcomesByType: Record<string, number>;
    averageResolutionTime?: number;
    immutableOutcomes: number;
  } {
    const outcomesByType: Record<string, number> = {
      claimant_favored: 0,
      respondent_favored: 0,
      compromise: 0,
      dismissed: 0,
      other: 0,
    };

    let immutableCount = 0;
    let totalResolutionTime = 0;
    let resolutionTimeCount = 0;

    for (const outcome of this.outcomes.values()) {
      outcomesByType[outcome.outcome]++;

      if (outcome.isImmutable) {
        immutableCount++;
      }

      // Note: We don't have dispute creation time here, so we can't calculate
      // resolution time accurately. This would need to be calculated at a higher level.
    }

    return {
      totalOutcomes: this.outcomes.size,
      outcomesByType,
      immutableOutcomes: immutableCount,
    };
  }

  /**
   * Save outcome to disk
   */
  private saveOutcome(outcome: DisputeResolution): void {
    const filePath = path.join(this.dataPath, `${outcome.resolutionId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(outcome, null, 2));
    } catch (error) {
      logger.error('Error saving outcome', {
        resolutionId: outcome.resolutionId,
        error,
      });
    }
  }

  /**
   * Load all outcomes from disk
   */
  private loadOutcomes(): void {
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
        const outcome: DisputeResolution = JSON.parse(content);

        this.outcomes.set(outcome.resolutionId, outcome);
      }

      logger.info('Outcomes loaded from disk', {
        count: this.outcomes.size,
      });
    } catch (error) {
      logger.error('Error loading outcomes', { error });
    }
  }
}
