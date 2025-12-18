import axios from 'axios';
import { Stake, Delegation, MediatorConfig } from '../types';
import { logger } from '../utils/logger';

/**
 * StakeManager handles DPoS stake and delegation management
 */
export class StakeManager {
  private config: MediatorConfig;
  private stake: Stake;

  constructor(config: MediatorConfig) {
    this.config = config;

    // Initialize stake
    this.stake = {
      mediatorId: config.mediatorPublicKey,
      amount: config.bondedStakeAmount || 0,
      delegatedAmount: 0,
      effectiveStake: config.bondedStakeAmount || 0,
      delegators: [],
      unbondingPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      status: 'unbonded',
    };
  }

  /**
   * Bond stake to the chain
   */
  public async bondStake(amount: number): Promise<boolean> {
    try {
      logger.info('Bonding stake', { amount });

      const response = await axios.post(`${this.config.chainEndpoint}/api/v1/stake/bond`, {
        mediatorId: this.config.mediatorPublicKey,
        amount,
        timestamp: Date.now(),
      });

      if (response.status === 200) {
        this.stake.amount = amount;
        this.stake.status = 'bonded';
        this.updateEffectiveStake();

        logger.info('Stake bonded successfully', {
          amount,
          effectiveStake: this.stake.effectiveStake,
        });

        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error bonding stake', { error });
      return false;
    }
  }

  /**
   * Unbond stake
   */
  public async unbondStake(): Promise<boolean> {
    try {
      logger.info('Initiating stake unbonding');

      const response = await axios.post(`${this.config.chainEndpoint}/api/v1/stake/unbond`, {
        mediatorId: this.config.mediatorPublicKey,
        timestamp: Date.now(),
      });

      if (response.status === 200) {
        this.stake.status = 'unbonding';
        logger.info('Stake unbonding initiated', { period: this.stake.unbondingPeriod });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error unbonding stake', { error });
      return false;
    }
  }

  /**
   * Load delegations from chain
   */
  public async loadDelegations(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/delegations/${this.config.mediatorPublicKey}`
      );

      if (response.data && response.data.delegations) {
        this.stake.delegators = response.data.delegations;
        this.updateEffectiveStake();

        logger.info('Loaded delegations from chain', {
          delegators: this.stake.delegators.length,
          delegatedAmount: this.stake.delegatedAmount,
          effectiveStake: this.stake.effectiveStake,
        });
      }
    } catch (error) {
      logger.warn('Could not load delegations from chain', { error });
    }
  }

  /**
   * Update effective stake calculation
   */
  private updateEffectiveStake(): void {
    const activeDelegations = this.stake.delegators.filter(d => d.status === 'active');
    this.stake.delegatedAmount = activeDelegations.reduce((sum, d) => sum + d.amount, 0);
    this.stake.effectiveStake = this.stake.amount + this.stake.delegatedAmount;

    logger.debug('Updated effective stake', {
      own: this.stake.amount,
      delegated: this.stake.delegatedAmount,
      effective: this.stake.effectiveStake,
    });
  }

  /**
   * Check if mediator meets minimum stake requirement
   */
  public meetsMinimumStake(): boolean {
    const minStake = this.config.minEffectiveStake || 0;
    const meets = this.stake.effectiveStake >= minStake;

    if (!meets) {
      logger.warn('Does not meet minimum stake requirement', {
        effective: this.stake.effectiveStake,
        required: minStake,
      });
    }

    return meets;
  }

  /**
   * Get current stake info
   */
  public getStake(): Stake {
    return { ...this.stake };
  }

  /**
   * Get effective stake amount
   */
  public getEffectiveStake(): number {
    return this.stake.effectiveStake;
  }

  /**
   * Handle slashing event
   */
  public async handleSlashing(amount: number, reason: string): Promise<void> {
    logger.error('Stake slashing event', { amount, reason });

    this.stake.amount = Math.max(0, this.stake.amount - amount);
    this.updateEffectiveStake();

    // Notify chain
    try {
      await axios.post(`${this.config.chainEndpoint}/api/v1/stake/slash`, {
        mediatorId: this.config.mediatorPublicKey,
        amount,
        reason,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Error notifying chain of slashing', { error });
    }
  }
}
