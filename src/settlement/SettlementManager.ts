import { nanoid } from 'nanoid';
import axios from 'axios';
import {
  ProposedSettlement,
  NegotiationResult,
  MediatorConfig,
  Intent,
  SettlementStatus,
} from '../types';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';

/**
 * SettlementManager handles the creation and submission of proposed settlements
 */
export class SettlementManager {
  private config: MediatorConfig;
  private activeSettlements: Map<string, ProposedSettlement> = new Map();

  constructor(config: MediatorConfig) {
    this.config = config;
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

    logger.info('Created proposed settlement', {
      id: settlementId,
      intentA: intentA.hash,
      intentB: intentB.hash,
      fee: facilitationFee,
    });

    return settlement;
  }

  /**
   * Submit a settlement to the chain
   */
  public async submitSettlement(settlement: ProposedSettlement): Promise<boolean> {
    try {
      logger.info('Submitting settlement to chain', { id: settlement.id });

      // Format as prose entry
      const proseEntry = this.formatSettlementAsProse(settlement);

      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/entries`,
        {
          type: 'settlement',
          author: this.config.mediatorPublicKey,
          content: proseEntry,
          metadata: settlement,
          signature: generateSignature(proseEntry, this.config.mediatorPrivateKey),
        }
      );

      if (response.status === 200 || response.status === 201) {
        this.activeSettlements.set(settlement.id, settlement);
        logger.info('Settlement submitted successfully', { id: settlement.id });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error submitting settlement', { error, settlementId: settlement.id });
      return false;
    }
  }

  /**
   * Format settlement as prose for chain entry
   */
  private formatSettlementAsProse(settlement: ProposedSettlement): string {
    const terms = settlement.proposedTerms;
    const termsStr = JSON.stringify(terms, null, 2);

    return `[PROPOSED SETTLEMENT]

Settlement ID: ${settlement.id}
Linking Intent #${settlement.intentHashA} (Party A) and #${settlement.intentHashB} (Party B)

Reasoning: ${settlement.reasoningTrace}

Proposed Terms:
${termsStr}

Facilitation Fee: ${settlement.facilitationFeePercent}% (${settlement.facilitationFee} NLC) to Mediator ${settlement.mediatorId}

Model Integrity Hash: ${settlement.modelIntegrityHash}
${settlement.stakeReference ? `Stake Reference: ${settlement.stakeReference}` : ''}
${settlement.authoritySignature ? `Authority Signature: ${settlement.authoritySignature}` : ''}

Acceptance Deadline: ${new Date(settlement.acceptanceDeadline).toISOString()}
`;
  }

  /**
   * Monitor settlement status
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

        // Check chain for acceptance entries
        const response = await axios.get(
          `${this.config.chainEndpoint}/api/v1/settlements/${id}/status`
        );

        if (response.data.partyAAccepted) {
          settlement.partyAAccepted = true;
        }

        if (response.data.partyBAccepted) {
          settlement.partyBAccepted = true;
        }

        if (response.data.challenges && response.data.challenges.length > 0) {
          settlement.challenges = response.data.challenges;
          logger.warn('Settlement challenged', { id, challenges: settlement.challenges?.length || 0 });
        }

        // Check if both accepted
        if (settlement.partyAAccepted && settlement.partyBAccepted) {
          await this.closeSettlement(settlement);
          this.activeSettlements.delete(id);
        }
      } catch (error) {
        logger.error('Error monitoring settlement', { error, settlementId: id });
      }
    }
  }

  /**
   * Close a settlement and claim fee
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

      // Create payout entry
      const payoutEntry = {
        type: 'payout',
        settlementId: settlement.id,
        mediatorId: this.config.mediatorPublicKey,
        amount: settlement.facilitationFee,
        timestamp: Date.now(),
      };

      await axios.post(`${this.config.chainEndpoint}/api/v1/entries`, {
        type: 'payout',
        author: this.config.mediatorPublicKey,
        content: `[PAYOUT] Settlement ${settlement.id} closed. Claiming fee: ${settlement.facilitationFee} NLC`,
        metadata: payoutEntry,
        signature: generateSignature(JSON.stringify(payoutEntry), this.config.mediatorPrivateKey),
      });

      settlement.status = 'closed';
      logger.info('Settlement closed and fee claimed', {
        id: settlement.id,
        fee: settlement.facilitationFee,
      });
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
   * Get active settlements
   */
  public getActiveSettlements(): ProposedSettlement[] {
    return Array.from(this.activeSettlements.values());
  }
}
