import { nanoid } from 'nanoid';
import {
  ProposedSettlement,
  NegotiationResult,
  MediatorConfig,
  Intent,
} from '../types';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';
import { BurnManager } from '../burn/BurnManager';
import { SemanticConsensusManager } from '../consensus/SemanticConsensusManager';
import { ChainClient } from '../chain';

/**
 * SettlementManager handles the creation and submission of proposed settlements
 * Uses ChainClient for NatLangChain API compatibility
 */
export class SettlementManager {
  private config: MediatorConfig;
  private activeSettlements: Map<string, ProposedSettlement> = new Map();
  private burnManager: BurnManager | null = null;
  private semanticConsensusManager: SemanticConsensusManager | null = null;
  private chainClient: ChainClient;

  constructor(
    config: MediatorConfig,
    burnManager?: BurnManager,
    semanticConsensusManager?: SemanticConsensusManager,
    chainClient?: ChainClient
  ) {
    this.config = config;
    this.burnManager = burnManager || null;
    this.semanticConsensusManager = semanticConsensusManager || null;
    this.chainClient = chainClient || ChainClient.fromConfig(config);
  }

  /**
   * Create a proposed settlement from negotiation result
   */
  public createSettlement(
    intentA: Intent,
    intentB: Intent,
    negotiationResult: NegotiationResult,
    effectiveStake?: number
  ): ProposedSettlement {
    const settlementId = nanoid();
    const timestamp = Date.now();
    const acceptanceWindowMs = this.config.acceptanceWindowHours * 60 * 60 * 1000;

    // Calculate facilitation fee
    const totalValue = (intentA.offeredFee || 0) + (intentB.offeredFee || 0);
    const facilitationFee = totalValue * (this.config.facilitationFeePercent / 100);

    const settlement: ProposedSettlement = {
      id: settlementId,
      intentHashA: intentA.hash,
      intentHashB: intentB.hash,
      reasoningTrace: negotiationResult.reasoning,
      proposedTerms: negotiationResult.proposedTerms,
      facilitationFee,
      facilitationFeePercent: this.config.facilitationFeePercent,
      modelIntegrityHash: negotiationResult.promptHash,
      mediatorId: this.config.mediatorPublicKey,
      timestamp,
      status: 'proposed',
      acceptanceDeadline: timestamp + acceptanceWindowMs,
      partyAAccepted: false,
      partyBAccepted: false,
      challenges: [],
    };

    // Add DPoS fields if applicable
    if (this.config.consensusMode === 'dpos' || this.config.consensusMode === 'hybrid') {
      settlement.effectiveStake = effectiveStake;
      settlement.stakeReference = `stake:${this.config.mediatorPublicKey}:${timestamp}`;
    }

    // Add PoA signature if applicable
    if (this.config.consensusMode === 'poa' || this.config.consensusMode === 'hybrid') {
      const dataToSign = this.getSettlementSignatureData(settlement);
      settlement.authoritySignature = generateSignature(
        dataToSign,
        this.config.poaAuthorityKey || this.config.mediatorPrivateKey
      );
    }

    // Check if semantic consensus verification is required (MP-01 Phase 3)
    if (this.semanticConsensusManager?.requiresVerification(settlement)) {
      settlement.requiresVerification = true;
      settlement.verificationStatus = 'pending';
      logger.info('High-value settlement requires semantic verification', {
        id: settlementId,
        value: this.calculateSettlementValue(settlement),
      });
    }

    logger.info('Created proposed settlement', {
      id: settlementId,
      intentA: intentA.hash,
      intentB: intentB.hash,
      fee: facilitationFee,
      requiresVerification: settlement.requiresVerification,
    });

    return settlement;
  }

  /**
   * Submit a settlement to the chain
   * Uses ChainClient for NatLangChain API compatibility
   */
  public async submitSettlement(settlement: ProposedSettlement): Promise<boolean> {
    try {
      logger.info('Submitting settlement to chain', { id: settlement.id });

      // Use ChainClient to submit settlement
      const result = await this.chainClient.submitSettlement(settlement);

      if (result.success) {
        this.activeSettlements.set(settlement.id, settlement);
        logger.info('Settlement submitted successfully', { id: settlement.id });

        // Initiate semantic verification if required (MP-01 Phase 3)
        if (settlement.requiresVerification && this.semanticConsensusManager) {
          try {
            const verification = await this.semanticConsensusManager.initiateVerification(
              settlement
            );
            settlement.verificationStatus = 'in_progress';
            settlement.verificationRequest = verification.request;
            logger.info('Semantic verification initiated', {
              settlementId: settlement.id,
              verifiers: verification.request.selectedVerifiers.length,
              deadline: new Date(verification.request.responseDeadline).toISOString(),
            });
          } catch (error) {
            logger.error('Failed to initiate semantic verification', {
              error,
              settlementId: settlement.id,
            });
            // Don't fail the settlement submission if verification initiation fails
            settlement.verificationStatus = 'not_required';
          }
        }

        return true;
      }

      logger.error('Settlement submission failed', { error: result.error });
      return false;
    } catch (error) {
      logger.error('Error submitting settlement', { error, settlementId: settlement.id });
      return false;
    }
  }

  /**
   * Monitor settlement status
   * Uses ChainClient for NatLangChain API compatibility
   */
  public async monitorSettlements(): Promise<void> {
    const now = Date.now();

    for (const [id, settlement] of this.activeSettlements.entries()) {
      try {
        // Check if acceptance deadline has passed
        if (settlement.acceptanceDeadline < now) {
          if (settlement.partyAAccepted && settlement.partyBAccepted) {
            await this.closeSettlement(settlement);
          } else {
            settlement.status = 'rejected';
            logger.info('Settlement expired', { id });
          }
          this.activeSettlements.delete(id);
          continue;
        }

        // Use ChainClient to check settlement status
        const status = await this.chainClient.getSettlementStatus(id);

        if (status) {
          if (status.partyAAccepted) {
            settlement.partyAAccepted = true;
          }

          if (status.partyBAccepted) {
            settlement.partyBAccepted = true;
          }

          if (status.challenges && status.challenges.length > 0) {
            settlement.challenges = status.challenges;
            logger.warn('Settlement challenged', { id, challenges: settlement.challenges?.length || 0 });
          }
        }

        // Check if both accepted
        if (settlement.partyAAccepted && settlement.partyBAccepted) {
          try {
            await this.closeSettlement(settlement);
            // Only delete from tracking after successful closure
            this.activeSettlements.delete(id);
          } catch (closeError) {
            // Keep settlement in tracking if closure fails to allow retry
            logger.error('Failed to close settlement, will retry', {
              error: closeError,
              settlementId: id,
            });
          }
        }
      } catch (error) {
        logger.error('Error monitoring settlement', { error, settlementId: id });
      }
    }
  }

  /**
   * Close a settlement and claim fee
   * Uses ChainClient for NatLangChain API compatibility
   */
  private async closeSettlement(settlement: ProposedSettlement): Promise<void> {
    try {
      logger.info('Closing settlement', { id: settlement.id });

      // Check for upheld challenges
      const upheldChallenges = settlement.challenges?.filter(c => c.status === 'upheld') || [];

      if (upheldChallenges.length > 0) {
        logger.warn('Settlement has upheld challenges, forfeiting fee', {
          id: settlement.id,
          challenges: upheldChallenges.length,
        });
        settlement.status = 'rejected';
        return;
      }

      // Check semantic verification status (MP-01 Phase 3)
      if (settlement.requiresVerification && this.semanticConsensusManager) {
        const verification = this.semanticConsensusManager.getVerification(settlement.id);

        if (!verification) {
          logger.error('Settlement requires verification but no verification found', {
            id: settlement.id,
          });
          settlement.status = 'rejected';
          return;
        }

        // Block closure until consensus is reached
        if (verification.status === 'pending' || verification.status === 'in_progress') {
          logger.info('Settlement closure blocked pending verification consensus', {
            id: settlement.id,
            verificationStatus: verification.status,
          });
          return; // Don't close yet, keep monitoring
        }

        // Check if consensus was reached successfully
        if (verification.status !== 'consensus_reached') {
          logger.warn('Settlement verification failed, cannot close', {
            id: settlement.id,
            verificationStatus: verification.status,
            consensusCount: verification.consensusCount,
            required: verification.requiredConsensus,
          });
          settlement.status = 'rejected';
          return;
        }

        logger.info('Settlement verification consensus reached, proceeding with closure', {
          id: settlement.id,
          consensusCount: verification.consensusCount,
        });
      }

      // Execute success burn (MP-06 Phase 5)
      // Calculate total settlement value from facilitation fee
      const settlementValue = settlement.facilitationFeePercent > 0
        ? settlement.facilitationFee / (settlement.facilitationFeePercent / 100)
        : 0;

      if (this.burnManager && settlementValue > 0) {
        try {
          const burnResult = await this.burnManager.executeSuccessBurn(
            settlement.id,
            settlementValue,
            this.config.mediatorPublicKey
          );

          if (burnResult) {
            logger.info('Success burn executed for settlement closure', {
              settlementId: settlement.id,
              settlementValue,
              burnAmount: burnResult.amount,
            });
          }
        } catch (burnError) {
          logger.error('Error executing success burn', {
            error: burnError,
            settlementId: settlement.id,
          });
          // Don't fail settlement closure due to burn errors
        }
      }

      // Use ChainClient to submit payout
      const payoutResult = await this.chainClient.submitPayout(
        settlement.id,
        settlement.facilitationFee
      );

      if (payoutResult.success) {
        settlement.status = 'closed';
        logger.info('Settlement closed and fee claimed', {
          id: settlement.id,
          fee: settlement.facilitationFee,
        });
      } else {
        logger.error('Failed to submit payout', {
          settlementId: settlement.id,
          error: payoutResult.error,
        });
      }
    } catch (error) {
      logger.error('Error closing settlement', { error, settlementId: settlement.id });
    }
  }

  /**
   * Get signature data for settlement
   */
  private getSettlementSignatureData(settlement: ProposedSettlement): string {
    return `${settlement.id}:${settlement.intentHashA}:${settlement.intentHashB}:${settlement.timestamp}`;
  }

  /**
   * Calculate settlement value from proposed terms
   */
  private calculateSettlementValue(settlement: ProposedSettlement): number {
    // Use the same logic as in closeSettlement
    return settlement.facilitationFeePercent > 0
      ? settlement.facilitationFee / (settlement.facilitationFeePercent / 100)
      : 0;
  }

  /**
   * Get active settlements
   */
  public getActiveSettlements(): ProposedSettlement[] {
    return Array.from(this.activeSettlements.values());
  }

  /**
   * Get the ChainClient instance
   */
  public getChainClient(): ChainClient {
    return this.chainClient;
  }
}
