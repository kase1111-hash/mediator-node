import crypto from 'crypto';

/**
 * Generate a hash for model integrity verification
 */
export function generateModelIntegrityHash(
  modelName: string,
  promptTemplate: string,
  version: string = '1.0'
): string {
  const data = `${modelName}:${version}:${promptTemplate}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a unique hash for an intent
 */
export function generateIntentHash(prose: string, author: string, timestamp: number): string {
  const data = `${prose}:${author}:${timestamp}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a cryptographic signature using RSA-SHA256
 *
 * SECURITY NOTE: This uses proper asymmetric cryptography.
 * Private keys should be in PEM format.
 *
 * @param data - Data to sign
 * @param privateKey - Private key in PEM format (RSA, EC, or Ed25519)
 * @returns Base64-encoded signature
 */
export function generateSignature(data: string, privateKey: string): string {
  try {
    // Check if this looks like a PEM key
    if (privateKey.includes('BEGIN') && privateKey.includes('PRIVATE KEY')) {
      // Use proper asymmetric cryptography
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      sign.end();
      return sign.sign(privateKey, 'base64');
    } else {
      // Fallback for development/testing with simple keys
      // This maintains backward compatibility but logs a warning
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Production environment requires PEM-formatted private keys');
      }

      // Development-only: symmetric HMAC
      const hmac = crypto.createHmac('sha256', privateKey);
      hmac.update(data);
      return hmac.digest('base64');
    }
  } catch (error: any) {
    throw new Error(`Signature generation failed: ${error.message}`);
  }
}

/**
 * Verify a cryptographic signature using RSA-SHA256
 *
 * SECURITY NOTE: This uses proper asymmetric verification.
 * Public keys should be in PEM format.
 *
 * @param data - Original data that was signed
 * @param signature - Base64-encoded signature
 * @param publicKey - Public key in PEM format (RSA, EC, or Ed25519)
 * @returns true if signature is valid
 */
export function verifySignature(data: string, signature: string, publicKey: string): boolean {
  try {
    // Check if this looks like a PEM key
    if (publicKey.includes('BEGIN') && publicKey.includes('PUBLIC KEY')) {
      // Use proper asymmetric verification
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      verify.end();
      return verify.verify(publicKey, signature, 'base64');
    } else {
      // Fallback for development/testing
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Production environment requires PEM-formatted public keys');
      }

      // Development-only: symmetric HMAC verification
      const hmac = crypto.createHmac('sha256', publicKey);
      hmac.update(data);
      const expected = hmac.digest('base64');
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'base64'),
        Buffer.from(expected, 'base64')
      );
    }
  } catch (error: any) {
    // Signature verification failure should not throw, just return false
    return false;
  }
}

/**
 * Generate RSA key pair for development/testing
 *
 * In production, keys should be generated securely offline and stored in
 * environment variables or a secure key management system.
 *
 * @returns Object containing privateKey and publicKey in PEM format
 */
export function generateKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}

/**
 * Calculate reputation weight based on MP-01 formula
 */
export function calculateReputationWeight(
  successfulClosures: number,
  failedChallenges: number,
  upheldChallengesAgainst: number,
  forfeitedFees: number
): number {
  const numerator = successfulClosures + (failedChallenges * 2);
  const denominator = 1 + upheldChallengesAgainst + forfeitedFees;
  return numerator / denominator;
}

/**
 * Calculate stake-weighted selection weight for DPoS
 */
export function calculateStakeWeight(
  reputationWeight: number,
  effectiveStake: number
): number {
  return reputationWeight * Math.log(1 + effectiveStake);
}
