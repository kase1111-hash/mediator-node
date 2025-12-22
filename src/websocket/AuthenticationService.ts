import { createHash, createVerify } from 'crypto';
import { AuthenticationMessage } from '../types';
import { logger } from '../utils/logger';

/**
 * Authentication result
 */
export interface AuthenticationResult {
  success: boolean;
  identity?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Authentication configuration
 */
export interface AuthenticationConfig {
  // Algorithm for signature verification (e.g., 'RSA-SHA256', 'Ed25519')
  algorithm?: string;

  // Maximum age of authentication message in milliseconds
  maxAge?: number;

  // Whether to require nonce for replay protection
  requireNonce?: boolean;

  // Custom verification function
  customVerify?: (message: AuthenticationMessage) => Promise<AuthenticationResult>;

  // Public key resolver (identity -> public key)
  publicKeyResolver?: (identity: string) => Promise<string | null>;
}

/**
 * Authentication service for WebSocket connections
 *
 * Provides signature verification and identity validation
 */
export class AuthenticationService {
  private config: Required<Omit<AuthenticationConfig, 'customVerify' | 'publicKeyResolver'>> & {
    customVerify?: (message: AuthenticationMessage) => Promise<AuthenticationResult>;
    publicKeyResolver?: (identity: string) => Promise<string | null>;
  };

  private usedNonces: Set<string> = new Set();
  private nonceCleanupInterval: NodeJS.Timeout;

  constructor(config: AuthenticationConfig = {}) {
    this.config = {
      algorithm: config.algorithm || 'RSA-SHA256',
      maxAge: config.maxAge || 5 * 60 * 1000, // 5 minutes
      requireNonce: config.requireNonce ?? true,
      customVerify: config.customVerify,
      publicKeyResolver: config.publicKeyResolver,
    };

    // Clean up old nonces every minute
    this.nonceCleanupInterval = setInterval(() => {
      // Clear all nonces (simple approach - could track timestamps for better cleanup)
      if (this.usedNonces.size > 10000) {
        this.usedNonces.clear();
      }
    }, 60000);
  }

  /**
   * Verify authentication message
   */
  public async verify(message: AuthenticationMessage): Promise<AuthenticationResult> {
    // Use custom verification if provided
    if (this.config.customVerify) {
      return this.config.customVerify(message);
    }

    // Validate required fields
    if (!message.identity || !message.signature || !message.timestamp) {
      return {
        success: false,
        error: 'Missing required authentication fields',
      };
    }

    // Check timestamp freshness
    const now = Date.now();
    const age = Math.abs(now - message.timestamp);

    if (age > this.config.maxAge) {
      return {
        success: false,
        error: `Authentication timestamp too old (age: ${age}ms, max: ${this.config.maxAge}ms)`,
      };
    }

    // Check nonce for replay protection
    if (this.config.requireNonce) {
      if (!message.nonce) {
        return {
          success: false,
          error: 'Nonce required for replay protection',
        };
      }

      if (this.usedNonces.has(message.nonce)) {
        return {
          success: false,
          error: 'Nonce already used (replay attack detected)',
        };
      }
    }

    // Verify signature
    try {
      const isValid = await this.verifySignature(message);

      if (!isValid) {
        return {
          success: false,
          error: 'Invalid signature',
        };
      }

      // Mark nonce as used
      if (message.nonce) {
        this.usedNonces.add(message.nonce);
      }

      logger.info('Authentication successful', {
        identity: message.identity,
        timestamp: message.timestamp,
      });

      return {
        success: true,
        identity: message.identity,
        metadata: {
          timestamp: message.timestamp,
          algorithm: this.config.algorithm,
        },
      };
    } catch (err: any) {
      logger.error('Authentication verification failed', {
        error: err.message,
        identity: message.identity,
      });

      return {
        success: false,
        error: `Verification error: ${err.message}`,
      };
    }
  }

  /**
   * Verify signature on authentication message
   */
  private async verifySignature(message: AuthenticationMessage): Promise<boolean> {
    // If no public key resolver, use simple hash-based verification for development
    if (!this.config.publicKeyResolver) {
      return this.verifyHashBasedSignature(message);
    }

    // Resolve public key for identity
    const publicKey = await this.config.publicKeyResolver(message.identity);

    if (!publicKey) {
      logger.warn('No public key found for identity', {
        identity: message.identity,
      });
      return false;
    }

    // Create message to verify (excludes signature field)
    const messageData = this.createSignatureMessage(message);

    // Verify signature
    try {
      const verify = createVerify(this.config.algorithm);
      verify.update(messageData);
      verify.end();

      return verify.verify(publicKey, message.signature, 'base64');
    } catch (err: any) {
      logger.error('Signature verification error', {
        error: err.message,
        identity: message.identity,
      });
      return false;
    }
  }

  /**
   * Simple hash-based signature verification for development
   *
   * In production, use proper public key cryptography
   */
  private verifyHashBasedSignature(message: AuthenticationMessage): boolean {
    // For development: verify that signature is SHA-256 hash of message data
    const messageData = this.createSignatureMessage(message);
    const expectedSignature = createHash('sha256')
      .update(messageData)
      .digest('base64');

    return message.signature === expectedSignature;
  }

  /**
   * Create canonical message string for signature verification
   */
  private createSignatureMessage(message: AuthenticationMessage): string {
    return `${message.identity}:${message.timestamp}:${message.nonce || ''}`;
  }

  /**
   * Create authentication message signature (helper for clients)
   */
  public static createSignature(
    identity: string,
    timestamp: number,
    nonce: string = ''
  ): string {
    const messageData = `${identity}:${timestamp}:${nonce}`;
    return createHash('sha256').update(messageData).digest('base64');
  }

  /**
   * Generate nonce for authentication
   */
  public static generateNonce(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex');
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    clearInterval(this.nonceCleanupInterval);
    this.usedNonces.clear();
  }
}
