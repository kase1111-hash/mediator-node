import { nanoid } from 'nanoid';
import {
  Challenge,
  ChallengeHistory,
  ChallengeSubmissionResult,
  ContradictionAnalysis,
  ProposedSettlement,
  MediatorConfig,
} from '../types';
import { logger } from '../utils/logger';
import { ReputationTracker } from '../reputation/ReputationTracker';
import { ChainClient } from '../chain';

/**
 * ChallengeManager handles the submission and lifecycle of challenges
 * against proposed settlements
 * Uses ChainClient for NatLangChain API compatibility
 */
export class ChallengeManager {
  private config: MediatorConfig;
  private reputationTracker: ReputationTracker | null = null;
  private submittedChallenges: Map<string, ChallengeHistory> = new Map();
  private chainClient: ChainClient;

  constructor(config: MediatorConfig, reputationTracker?: ReputationTracker, chainClient?: ChainClient) {
    this.config = config;
    this.reputationTracker = reputationTracker || null;
    this.chainClient = chainClient || ChainClient.fromConfig(config);
  }

  /**
   * Submit a challenge against a settlement
   */
  public async submitChallenge(
    settlement: ProposedSettlement,
    analysis: ContradictionAnalysis
  ): Promise<ChallengeSubmissionResult> {
    try {
      const challengeId = nanoid();
      const timestamp = Date.now();

      // Create the challenge object
      const challenge: Challenge = {
        id: challengeId,
        settlementId: settlement.id,
        challengerId: this.config.mediatorPublicKey,
        contradictionProof: analysis.contradictionProof,
        paraphraseEvidence: analysis.paraphraseEvidence,
        timestamp,
        status: 'pending',
      };

      // Submit challenge using ChainClient
      const result = await this.chainClient.submitChallenge(challenge);

      if (result.success) {
        logger.info('Challenge submitted successfully', {
          challengeId,
          settlementId: settlement.id,
          targetMediator: settlement.mediatorId,
        });

        // Track the submitted challenge
        const history: ChallengeHistory = {
          challengeId,
          settlementId: settlement.id,
          targetMediatorId: settlement.mediatorId,
          submittedAt: timestamp,
          status: 'pending',
          contradictionAnalysis: analysis,
          lastChecked: timestamp,
        };

        this.submittedChallenges.set(challengeId, history);

        return {
          success: true,
          challengeId,
          timestamp,
        };
      } else {
        logger.warn('Challenge submission failed', {
          error: result.error,
          challengeId,
        });

        return {
          success: false,
          error: result.error || 'Challenge submission failed',
          timestamp,
        };
      }
    } catch (error) {
      logger.error('Error submitting challenge', {
        error,
        settlementId: settlement.id,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Format a challenge as a prose entry for the chain
   */
  private formatChallengeAsProse(
    challenge: Challenge,
    settlement: ProposedSettlement,
    analysis: ContradictionAnalysis
  ): string {
    const severity = analysis.severity.toUpperCase();
    const affectedParty = analysis.affectedParty === 'A' ? 'Party A' :
                          analysis.affectedParty === 'B' ? 'Party B' : 'both parties';

    let prose = `[CHALLENGE SUBMISSION]\n\n`;
    prose += `Challenge ID: ${challenge.id}\n`;
    prose += `Settlement ID: ${settlement.id}\n`;
    prose += `Challenger: ${this.config.mediatorPublicKey}\n`;
    prose += `Target Mediator: ${settlement.mediatorId}\n`;
    prose += `Timestamp: ${new Date(challenge.timestamp).toISOString()}\n\n`;

    prose += `SEVERITY: ${severity}\n`;
    prose += `AFFECTED PARTY: ${affectedParty}\n`;
    prose += `CONFIDENCE: ${(analysis.confidence * 100).toFixed(1)}%\n\n`;

    prose += `VIOLATED CONSTRAINTS:\n`;
    analysis.violatedConstraints.forEach((constraint, idx) => {
      prose += `${idx + 1}. ${constraint}\n`;
    });

    prose += `\nCONTRADICTION PROOF:\n`;
    prose += `${analysis.contradictionProof}\n\n`;

    prose += `PARAPHRASE EVIDENCE:\n`;
    prose += `${analysis.paraphraseEvidence}\n\n`;

    prose += `This challenge asserts that the proposed settlement violates explicit constraints `;
    prose += `from the original intent(s). The settlement should be rejected or the mediator's `;
    prose += `facilitation fee should be forfeited if this challenge is upheld by consensus validation.\n`;

    return prose;
  }

  /**
   * Monitor submitted challenges for status updates
   */
  public async monitorChallenges(): Promise<void> {
    const now = Date.now();

    for (const [challengeId, history] of this.submittedChallenges.entries()) {
      try {
        // Check if we should poll for updates (don't spam the API)
        const timeSinceLastCheck = now - history.lastChecked;
        const checkInterval = this.config.challengeCheckInterval || 60000; // Default 60s

        if (timeSinceLastCheck < checkInterval) {
          continue;
        }

        // Fetch challenge status using ChainClient
        const statusResult = await this.chainClient.getChallengeStatus(challengeId);

        if (statusResult && statusResult.status) {
          const newStatus = statusResult.status;
          const oldStatus = history.status;

          // Update local tracking
          history.status = newStatus;
          history.lastChecked = now;

          // Handle status changes (resolved from pending)
          if (newStatus !== 'pending' && oldStatus === 'pending') {
            logger.info('Challenge status changed', {
              challengeId,
              oldStatus,
              newStatus,
            });

            // Update reputation based on outcome
            await this.handleChallengeResolution(challengeId, history, newStatus);
          }
        }
      } catch (error) {
        logger.error('Error monitoring challenge', { error, challengeId });
      }
    }
  }

  /**
   * Handle the resolution of a challenge (upheld or rejected)
   */
  private async handleChallengeResolution(
    challengeId: string,
    history: ChallengeHistory,
    status: 'upheld' | 'rejected'
  ): Promise<void> {
    if (!this.reputationTracker) {
      logger.warn('No reputation tracker available for challenge resolution');
      return;
    }

    if (status === 'rejected') {
      // Our challenge was rejected - we made a failed challenge
      logger.info('Challenge rejected, incrementing failed challenges counter', {
        challengeId,
      });

      await this.reputationTracker.recordFailedChallenge(challengeId);
    } else if (status === 'upheld') {
      // Our challenge was upheld - this is good for our reputation
      // The target mediator's "upheldChallengesAgainst" counter will be incremented by the chain
      logger.info('Challenge upheld successfully', {
        challengeId,
        targetMediator: history.targetMediatorId,
      });

      // Note: We don't increment anything for ourselves when upheld
      // The reputation benefit comes from NOT having failedChallenges
    }

    // Remove from active monitoring after resolution
    this.submittedChallenges.delete(challengeId);
  }

  /**
   * Get all submitted challenges
   */
  public getSubmittedChallenges(): ChallengeHistory[] {
    return Array.from(this.submittedChallenges.values());
  }

  /**
   * Get challenge history for a specific settlement
   */
  public getChallengesForSettlement(settlementId: string): ChallengeHistory[] {
    return this.getSubmittedChallenges().filter(
      (challenge) => challenge.settlementId === settlementId
    );
  }

  /**
   * Get statistics about submitted challenges
   */
  public getChallengeStats(): {
    total: number;
    pending: number;
    upheld: number;
    rejected: number;
    successRate: number;
  } {
    const challenges = this.getSubmittedChallenges();
    const pending = challenges.filter((c) => c.status === 'pending').length;
    const upheld = challenges.filter((c) => c.status === 'upheld').length;
    const rejected = challenges.filter((c) => c.status === 'rejected').length;

    const resolved = upheld + rejected;
    const successRate = resolved > 0 ? (upheld / resolved) * 100 : 0;

    return {
      total: challenges.length,
      pending,
      upheld,
      rejected,
      successRate,
    };
  }
}
