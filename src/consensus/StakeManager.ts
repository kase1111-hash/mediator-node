import axios from 'axios';
import { Stake, MediatorConfig } from '../types';
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

      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/stake/bond`,
        {
          mediatorId: this.config.mediatorPublicKey,
          amount,
          timestamp: Date.now(),
        },
        { timeout: 15000 }
      );

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

      logger.warn('Stake bonding returned unexpected status', {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          logger.error('Could not connect to chain endpoint for stake bonding', {
            endpoint: this.config.chainEndpoint,
            error: 'Connection refused',
          });
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          logger.error('Timeout bonding stake', {
            endpoint: this.config.chainEndpoint,
            amount,
          });
        } else if (error.response) {
          logger.error('Chain returned error bonding stake', {
            status: error.response.status,
            statusText: error.response.statusText,
            amount,
          });
        } else {
          logger.error('Network error bonding stake', {
            message: error.message,
            code: error.code,
          });
        }
      } else {
        logger.error('Unexpected error bonding stake', {
          error: error instanceof Error ? error.message : 'Unknown error',
          amount,
        });
      }
      return false;
    }
  }

  /**
   * Unbond stake
   */
  public async unbondStake(): Promise<boolean> {
    try {
      logger.info('Initiating stake unbonding');

      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/stake/unbond`,
        {
          mediatorId: this.config.mediatorPublicKey,
          timestamp: Date.now(),
        },
        { timeout: 15000 }
      );

      if (response.status === 200) {
        this.stake.status = 'unbonding';
        logger.info('Stake unbonding initiated', { period: this.stake.unbondingPeriod });
        return true;
      }

      logger.warn('Stake unbonding returned unexpected status', {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          logger.error('Could not connect to chain endpoint for stake unbonding', {
            endpoint: this.config.chainEndpoint,
            error: 'Connection refused',
          });
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          logger.error('Timeout unbonding stake', {
            endpoint: this.config.chainEndpoint,
          });
        } else if (error.response) {
          logger.error('Chain returned error unbonding stake', {
            status: error.response.status,
            statusText: error.response.statusText,
          });
        } else {
          logger.error('Network error unbonding stake', {
            message: error.message,
            code: error.code,
          });
        }
      } else {
        logger.error('Unexpected error unbonding stake', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return false;
    }
  }

  /**
   * Load delegations from chain
   */
  public async loadDelegations(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/delegations/${this.config.mediatorPublicKey}`,
        { timeout: 10000 }
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
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          logger.warn('Could not connect to chain endpoint for delegations', {
            endpoint: this.config.chainEndpoint,
            error: 'Connection refused',
          });
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          logger.warn('Timeout loading delegations from chain', {
            endpoint: this.config.chainEndpoint,
          });
        } else if (error.response) {
          logger.warn('Chain returned error loading delegations', {
            status: error.response.status,
            statusText: error.response.statusText,
          });
        } else {
          logger.warn('Network error loading delegations', {
            message: error.message,
            code: error.code,
          });
        }
      } else {
        logger.warn('Unexpected error loading delegations', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
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
      await axios.post(
        `${this.config.chainEndpoint}/api/v1/stake/slash`,
        {
          mediatorId: this.config.mediatorPublicKey,
          amount,
          reason,
          timestamp: Date.now(),
        },
        { timeout: 10000 }
      );
      logger.info('Chain notified of slashing event', { amount, reason });
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          logger.error('Could not connect to chain to notify slashing', {
            endpoint: this.config.chainEndpoint,
            error: 'Connection refused',
            amount,
            reason,
          });
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          logger.error('Timeout notifying chain of slashing', {
            endpoint: this.config.chainEndpoint,
            amount,
            reason,
          });
        } else if (error.response) {
          logger.error('Chain returned error for slashing notification', {
            status: error.response.status,
            statusText: error.response.statusText,
            amount,
            reason,
          });
        } else {
          logger.error('Network error notifying chain of slashing', {
            message: error.message,
            code: error.code,
            amount,
            reason,
          });
        }
      } else {
        logger.error('Unexpected error notifying chain of slashing', {
          error: error instanceof Error ? error.message : 'Unknown error',
          amount,
          reason,
        });
      }
    }
  }
}
