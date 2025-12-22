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

  // SECURITY: Track nonces with timestamps for proper expiration
  private usedNonces: Map<string, number> = new Map(); // nonce -> timestamp
  private nonceCleanupInterval: NodeJS.Timeout;

  constructor(config: AuthenticationConfig = {}) {
    this.config = {
      algorithm: config.algorithm || 'RSA-SHA256',
      maxAge: config.maxAge || 5 * 60 * 1000, // 5 minutes
      requireNonce: config.requireNonce ?? true,
      customVerify: config.customVerify,
      publicKeyResolver: config.publicKeyResolver,
    };

    // SECURITY: Clean up expired nonces based on timestamps (fixes replay attack vulnerability)
    this.nonceCleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = this.config.maxAge;
      let removedCount = 0;

      // Remove expired nonces based on timestamp
      for (const [nonce, timestamp] of this.usedNonces.entries()) {
        if (now - timestamp > maxAge) {
          this.usedNonces.delete(nonce);
          removedCount++;
        }
      }

      // SECURITY: Safety limit - if nonce map grows too large, remove oldest entries
      // This prevents DoS but only as a fallback (shouldn't happen in normal operation)
      if (this.usedNonces.size > 100000) {
        logger.error('Nonce set exceeded safety limit', {
          size: this.usedNonces.size,
          removedExpired: removedCount,
        });

        // Sort by timestamp and remove oldest 50%
        const sorted = Array.from(this.usedNonces.entries()).sort((a, b) => a[1] - b[1]);
        const toRemove = sorted.slice(0, Math.floor(sorted.length / 2));

        toRemove.forEach(([nonce]) => {
          this.usedNonces.delete(nonce);
        });

        logger.warn('Emergency nonce cleanup performed', {
          removed: toRemove.length,
          remaining: this.usedNonces.size,
        });
      }

      if (removedCount > 0) {
        logger.debug('Nonce cleanup completed', {
          removed: removedCount,
          remaining: this.usedNonces.size,
        });
      }
    }, 60000); // Run every minute
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

      // SECURITY: Mark nonce as used with timestamp for proper expiration
      if (message.nonce) {
        this.usedNonces.set(message.nonce, Date.now());
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
    // SECURITY: Prevent use of development-only authentication in production
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Hash-based authentication is not allowed in production. ' +
        'Use proper public key cryptography (RSA/Ed25519).'
      );
    }

    // Log warning about using development authentication
    logger.warn('Using development-only hash-based authentication', {
      identity: message.identity,
      environment: process.env.NODE_ENV || 'development',
      warning: 'This method should only be used in development/testing',
    });

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
