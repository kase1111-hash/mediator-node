import axios from 'axios';
import { MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import { verifySignature } from '../utils/crypto';

/**
 * AuthorityManager handles PoA (Proof-of-Authority) operations
 */
export class AuthorityManager {
  private config: MediatorConfig;
  private authoritySet: Set<string> = new Set();
  private isAuthorized: boolean = false;

  constructor(config: MediatorConfig) {
    this.config = config;
  }

  /**
   * Load the current authority set from the chain
   */
  public async loadAuthoritySet(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/consensus/authorities`
      );

      if (response.data && response.data.authorities) {
        this.authoritySet = new Set(response.data.authorities);

        // Check if this mediator is authorized
        this.isAuthorized = this.authoritySet.has(this.config.mediatorPublicKey);

        logger.info('Loaded authority set', {
          totalAuthorities: this.authoritySet.size,
          isAuthorized: this.isAuthorized,
        });
      }
    } catch (error) {
      logger.warn('Could not load authority set from chain', { error });
    }
  }

  /**
   * Check if this mediator is authorized
   */
  public checkAuthorization(): boolean {
    if (this.config.consensusMode === 'poa' || this.config.consensusMode === 'hybrid') {
      if (!this.isAuthorized) {
        logger.error('Mediator is not in the authority set', {
          publicKey: this.config.mediatorPublicKey,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Verify if a public key is in the authority set
   */
  public isAuthority(publicKey: string): boolean {
    return this.authoritySet.has(publicKey);
  }

  /**
   * Get all authorities
   */
  public getAuthorities(): string[] {
    return Array.from(this.authoritySet);
  }

  /**
   * Request to be added to authority set (via governance)
   */
  public async requestAuthorization(): Promise<boolean> {
    try {
      logger.info('Requesting authorization to join authority set');

      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/governance/proposals`,
        {
          type: 'authority_add',
          proposerId: this.config.mediatorPublicKey,
          title: `Add ${this.config.mediatorPublicKey} to Authority Set`,
          description: 'Request to join the mediator authority set',
          parameters: {
            publicKey: this.config.mediatorPublicKey,
          },
          timestamp: Date.now(),
        }
      );

      if (response.status === 200 || response.status === 201) {
        logger.info('Authorization request submitted');
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error requesting authorization', { error });
      return false;
    }
  }
}
