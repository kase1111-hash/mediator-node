import axios from 'axios';
import { MediatorReputation, MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import { calculateReputationWeight } from '../utils/crypto';

/**
 * ReputationTracker manages mediator reputation metrics
 */
export class ReputationTracker {
  private config: MediatorConfig;
  private reputation: MediatorReputation;

  constructor(config: MediatorConfig) {
    this.config = config;

    // Initialize reputation
    this.reputation = {
      mediatorId: config.mediatorPublicKey,
      successfulClosures: 0,
      failedChallenges: 0,
      upheldChallengesAgainst: 0,
      forfeitedFees: 0,
      weight: 1.0, // Starting weight
      lastUpdated: Date.now(),
    };
  }

  /**
   * Load reputation from chain
   */
  public async loadReputation(): Promise<void> {
    try {
      const endpoint = this.config.reputationChainEndpoint || this.config.chainEndpoint;
      const response = await axios.get(
        `${endpoint}/api/v1/reputation/${this.config.mediatorPublicKey}`
      );

      if (response.data) {
        this.reputation = {
          ...response.data,
          mediatorId: this.config.mediatorPublicKey,
        };

        logger.info('Loaded reputation from chain', {
          weight: this.reputation.weight,
          closures: this.reputation.successfulClosures,
        });
      }
    } catch (error) {
      logger.warn('Could not load reputation from chain, using defaults', { error });
    }
  }

  /**
   * Record a successful closure
   */
  public async recordSuccessfulClosure(settlementId: string): Promise<void> {
    this.reputation.successfulClosures += 1;
    this.recalculateWeight();

    logger.info('Recorded successful closure', {
      settlementId,
      totalClosures: this.reputation.successfulClosures,
      newWeight: this.reputation.weight,
    });

    await this.publishReputationUpdate();
  }

  /**
   * Record a failed challenge (submitted by this mediator, rejected)
   */
  public async recordFailedChallenge(challengeId: string): Promise<void> {
    this.reputation.failedChallenges += 1;
    this.recalculateWeight();

    logger.info('Recorded failed challenge', {
      challengeId,
      totalFailed: this.reputation.failedChallenges,
      newWeight: this.reputation.weight,
    });

    await this.publishReputationUpdate();
  }

  /**
   * Record an upheld challenge against this mediator
   */
  public async recordUpheldChallengeAgainst(challengeId: string): Promise<void> {
    this.reputation.upheldChallengesAgainst += 1;
    this.recalculateWeight();

    logger.warn('Recorded upheld challenge against mediator', {
      challengeId,
      totalUpheld: this.reputation.upheldChallengesAgainst,
      newWeight: this.reputation.weight,
    });

    await this.publishReputationUpdate();
  }

  /**
   * Record a forfeited fee
   */
  public async recordForfeitedFee(settlementId: string): Promise<void> {
    this.reputation.forfeitedFees += 1;
    this.recalculateWeight();

    logger.warn('Recorded forfeited fee', {
      settlementId,
      totalForfeited: this.reputation.forfeitedFees,
      newWeight: this.reputation.weight,
    });

    await this.publishReputationUpdate();
  }

  /**
   * Recalculate reputation weight using MP-01 formula
   */
  private recalculateWeight(): void {
    this.reputation.weight = calculateReputationWeight(
      this.reputation.successfulClosures,
      this.reputation.failedChallenges,
      this.reputation.upheldChallengesAgainst,
      this.reputation.forfeitedFees
    );

    this.reputation.lastUpdated = Date.now();
  }

  /**
   * Publish reputation update to chain
   */
  private async publishReputationUpdate(): Promise<void> {
    try {
      const endpoint = this.config.reputationChainEndpoint || this.config.chainEndpoint;

      await axios.post(`${endpoint}/api/v1/reputation`, {
        mediatorId: this.config.mediatorPublicKey,
        reputation: this.reputation,
        timestamp: Date.now(),
      });

      logger.debug('Published reputation update to chain');
    } catch (error) {
      logger.error('Error publishing reputation update', { error });
    }
  }

  /**
   * Get current reputation
   */
  public getReputation(): MediatorReputation {
    return { ...this.reputation };
  }

  /**
   * Get reputation weight
   */
  public getWeight(): number {
    return this.reputation.weight;
  }
}
