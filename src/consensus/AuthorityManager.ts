import axios from 'axios';
import { MediatorConfig } from '../types';
import { logger } from '../utils/logger';
// verifySignature available for future authority verification
// import { verifySignature } from '../utils/crypto';

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
        `${this.config.chainEndpoint}/api/v1/consensus/authorities`,
        { timeout: 10000 }
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
    } catch (error: any) {
      // Provide detailed error context based on error type
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          logger.warn('Could not connect to chain endpoint for authority set', {
            endpoint: this.config.chainEndpoint,
            error: 'Connection refused',
          });
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          logger.warn('Timeout loading authority set from chain', {
            endpoint: this.config.chainEndpoint,
            timeout: '10000ms',
          });
        } else if (error.response) {
          logger.warn('Chain returned error loading authority set', {
            status: error.response.status,
            statusText: error.response.statusText,
            endpoint: this.config.chainEndpoint,
          });
        } else {
          logger.warn('Network error loading authority set', {
            message: error.message,
            code: error.code,
          });
        }
      } else {
        logger.warn('Unexpected error loading authority set', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
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
        },
        { timeout: 15000 }
      );

      if (response.status === 200 || response.status === 201) {
        logger.info('Authorization request submitted');
        return true;
      }

      logger.warn('Authorization request returned unexpected status', {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    } catch (error: any) {
      // Provide detailed error context based on error type
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          logger.error('Could not connect to chain endpoint for authorization request', {
            endpoint: this.config.chainEndpoint,
            error: 'Connection refused',
          });
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          logger.error('Timeout submitting authorization request', {
            endpoint: this.config.chainEndpoint,
            timeout: '15000ms',
          });
        } else if (error.response) {
          logger.error('Chain returned error for authorization request', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          });
        } else {
          logger.error('Network error submitting authorization request', {
            message: error.message,
            code: error.code,
          });
        }
      } else {
        logger.error('Unexpected error requesting authorization', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return false;
    }
  }
}
