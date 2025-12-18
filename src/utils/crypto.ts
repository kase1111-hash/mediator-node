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
 * Generate a signature (placeholder for actual cryptographic signing)
 */
export function generateSignature(data: string, privateKey: string): string {
  // In production, use proper elliptic curve cryptography
  const hash = crypto.createHash('sha256').update(data + privateKey).digest('hex');
  return hash;
}

/**
 * Verify a signature
 */
export function verifySignature(data: string, signature: string, publicKey: string): boolean {
  // In production, use proper signature verification
  const expectedSig = generateSignature(data, publicKey);
  return signature === expectedSig;
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
