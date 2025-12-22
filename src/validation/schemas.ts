/**
 * Zod Validation Schemas
 *
 * Comprehensive runtime validation for all data types in the mediator node.
 * Provides type-safe parsing and validation to prevent injection attacks,
 * prototype pollution, and data corruption.
 */

import { z } from 'zod';

// ============================================================================
// Core Intent Schemas
// ============================================================================

export const IntentSchema = z.object({
  hash: z.string().min(1).max(256),
  author: z.string().min(1).max(256),
  prose: z.string().min(1).max(10000),
  timestamp: z.number().int().positive(),
  status: z.enum(['pending', 'matched', 'settled', 'challenged', 'rejected']),
  offeredFee: z.number().nonnegative().optional(),
  constraints: z.array(z.string().max(1000)).default([]),
  desires: z.array(z.string().max(1000)).default([]),
  branch: z.string().max(256).optional(),
  nonce: z.string().max(256).optional(),
  signature: z.string().max(1024).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ValidatedIntent = z.infer<typeof IntentSchema>;

// ============================================================================
// Settlement Schemas
// ============================================================================

export const ProposedTermsSchema = z.object({
  price: z.number().nonnegative().optional(),
  deliverables: z.array(z.string().max(1000)).optional(),
  timeline: z.string().max(500).optional(),
  additionalTerms: z.record(z.unknown()).optional(),
});

export const ProposedSettlementSchema = z.object({
  id: z.string().min(1).max(256),
  intentHashA: z.string().min(1).max(256),
  intentHashB: z.string().min(1).max(256),
  reasoningTrace: z.string().min(1).max(20000),
  proposedTerms: ProposedTermsSchema,
  facilitationFee: z.number().nonnegative(),
  facilitationFeePercent: z.number().min(0).max(100),
  mediatorId: z.string().min(1).max(256),
  modelIntegrityHash: z.string().min(1).max(256),
  timestamp: z.number().int().positive(),
  acceptanceDeadline: z.number().int().positive(),
  status: z.enum(['proposed', 'accepted', 'rejected', 'expired', 'challenged']),
  stakeReference: z.string().max(256).optional(),
  authoritySignature: z.string().max(1024).optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export type ValidatedProposedSettlement = z.infer<typeof ProposedSettlementSchema>;

// ============================================================================
// Dispute Schemas
// ============================================================================

export const DisputeDeclarationSchema = z.object({
  disputeId: z.string().min(1).max(256),
  settlementId: z.string().min(1).max(256),
  challenger: z.string().min(1).max(256),
  challengeType: z.enum(['misalignment', 'fraud', 'bias', 'other']),
  evidence: z.array(z.string().max(256)),
  description: z.string().min(1).max(10000),
  timestamp: z.number().int().positive(),
  status: z.enum([
    'pending',
    'under_review',
    'clarification_requested',
    'escalated',
    'resolved',
    'rejected',
  ]),
  mediatorResponse: z.string().max(10000).optional(),
  resolution: z.string().max(10000).optional(),
  penalty: z.number().nonnegative().optional(),
}).passthrough(); // Allow additional fields from actual type

export type ValidatedDisputeDeclaration = z.infer<typeof DisputeDeclarationSchema>;

export const EvidenceItemSchema = z.object({
  itemId: z.string().min(1).max(256),
  disputeId: z.string().min(1).max(256),
  submittedBy: z.string().min(1).max(256),
  itemType: z.enum(['document', 'screenshot', 'log', 'witness', 'other']),
  content: z.string().max(100000),
  contentHash: z.string().min(1).max(256),
  timestamp: z.number().int().positive(),
  frozen: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
});

export type ValidatedEvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ============================================================================
// Licensing & Delegation Schemas (MP-04)
// ============================================================================

export const LicenseSchema = z.object({
  licenseId: z.string().min(1).max(256),
  mediatorId: z.string().min(1).max(256),
  authorityId: z.string().min(1).max(256),
  grantedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive().optional(),
  status: z.enum(['active', 'revoked', 'expired', 'suspended']),
  scope: z.enum(['full', 'limited', 'emergency']).optional(),
  terms: z.string().max(5000).optional(),
  signature: z.string().max(1024),
  metadata: z.record(z.unknown()).optional(),
});

export type ValidatedLicense = z.infer<typeof LicenseSchema>;

export const DelegationSchema = z.object({
  delegationId: z.string().min(1).max(256),
  delegatorId: z.string().min(1).max(256),
  delegateId: z.string().min(1).max(256),
  grantedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive().optional(),
  status: z.enum(['active', 'revoked', 'expired']),
  scope: z.string().max(1000).optional(),
  signature: z.string().max(1024),
  metadata: z.record(z.unknown()).optional(),
});

export type ValidatedDelegation = z.infer<typeof DelegationSchema>;

// ============================================================================
// Effort Receipt Schemas (MP-02)
// ============================================================================

export const EffortSignalSchema = z.object({
  timestamp: z.number().int().positive(),
  modality: z.enum(['keystroke', 'mouse', 'voice', 'edit', 'commit', 'other']),
  intensity: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const EffortReceiptSchema = z.object({
  receiptId: z.string().min(1).max(256),
  userId: z.string().min(1).max(256),
  taskId: z.string().min(1).max(256).optional(),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  signals: z.array(EffortSignalSchema),
  signalHash: z.string().min(1).max(256),
  anchored: z.boolean(),
  anchorTxHash: z.string().max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough(); // Allow additional fields from actual type

export type ValidatedEffortReceipt = z.infer<typeof EffortReceiptSchema>;

// ============================================================================
// Governance Schemas
// ============================================================================

export const GovernanceProposalSchema = z.object({
  id: z.string().min(1).max(256),
  proposerId: z.string().min(1).max(256),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  proposalType: z.enum(['parameter_change', 'authority_add', 'authority_remove', 'mode_transition']),
  parameters: z.record(z.unknown()).optional(),
  votingPeriodEnd: z.number().int().positive(),
  executionDelay: z.number().int().positive(),
  executionTime: z.number().int().positive().optional(),
  status: z.enum(['voting', 'passed', 'rejected', 'executed', 'expired']),
  votes: z.object({
    for: z.number().nonnegative(),
    against: z.number().nonnegative(),
    abstain: z.number().nonnegative(),
  }),
  quorumRequired: z.number().min(0).max(100),
  timestamp: z.number().int().positive(),
  prose: z.string().max(20000).optional(),
});

export type ValidatedGovernanceProposal = z.infer<typeof GovernanceProposalSchema>;

export const GovernanceVoteSchema = z.object({
  id: z.string().min(1).max(256),
  proposalId: z.string().min(1).max(256),
  voterId: z.string().min(1).max(256),
  voteType: z.enum(['for', 'against', 'abstain']),
  votingPower: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
  signature: z.string().max(1024).optional(),
});

export type ValidatedGovernanceVote = z.infer<typeof GovernanceVoteSchema>;

// ============================================================================
// WebSocket Message Schemas
// ============================================================================

export const AuthenticationMessageSchema = z.object({
  identity: z.string().min(1).max(256),
  signature: z.string().min(1).max(1024),
  timestamp: z.number().int().positive(),
  nonce: z.string().max(256).optional(),
});

export const SubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  channels: z.array(z.enum([
    'intents',
    'settlements',
    'challenges',
    'receipts',
    'disputes',
    'licenses',
    'delegations',
    'burns',
    'governance',
    'reputation',
    'verifications',
    'system',
    'metrics',
  ])),
  filters: z.record(z.unknown()).optional(),
});

export const UnsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  channels: z.array(z.string()),
});

export const PingMessageSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.number().int().positive().optional(),
});

export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  PingMessageSchema,
]);

export type ValidatedWebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// ============================================================================
// Settlement & Capitalization Schemas (MP-05)
// ============================================================================

export const MP05SettlementSchema = z.object({
  settlementId: z.string().min(1).max(256),
  intentHashA: z.string().min(1).max(256),
  intentHashB: z.string().min(1).max(256),
  mediatorId: z.string().min(1).max(256),
  agreedTerms: ProposedTermsSchema,
  facilitationFee: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
  status: z.enum(['pending', 'completed', 'disputed', 'cancelled']),
  capitalizedAt: z.number().int().positive().optional(),
  capitalizedBy: z.string().max(256).optional(),
  burn: z.object({
    baseBurn: z.number().nonnegative(),
    successBurn: z.number().nonnegative(),
    totalBurned: z.number().nonnegative(),
  }).optional(),
});

export type ValidatedMP05Settlement = z.infer<typeof MP05SettlementSchema>;

// ============================================================================
// Burn Schemas (MP-06)
// ============================================================================

export const BurnRecordSchema = z.object({
  burnId: z.string().min(1).max(256),
  userId: z.string().min(1).max(256),
  intentHash: z.string().min(1).max(256),
  burnType: z.enum(['filing', 'success', 'spam_proof', 'penalty']),
  amount: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
  txHash: z.string().max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ValidatedBurnRecord = z.infer<typeof BurnRecordSchema>;

// ============================================================================
// Challenge Schemas
// ============================================================================

export const ChallengeSchema = z.object({
  challengeId: z.string().min(1).max(256),
  settlementId: z.string().min(1).max(256),
  challenger: z.string().min(1).max(256),
  reason: z.string().min(1).max(5000),
  confidence: z.number().min(0).max(100),
  timestamp: z.number().int().positive(),
  status: z.enum(['pending', 'investigating', 'upheld', 'rejected']),
  resolution: z.string().max(10000).optional(),
});

export type ValidatedChallenge = z.infer<typeof ChallengeSchema>;

// ============================================================================
// Reputation Schemas
// ============================================================================

export const ReputationRecordSchema = z.object({
  mediatorId: z.string().min(1).max(256),
  successfulClosures: z.number().int().nonnegative(),
  failedChallenges: z.number().int().nonnegative(),
  upheldChallengesAgainst: z.number().int().nonnegative(),
  forfeitedFees: z.number().int().nonnegative(),
  reputationWeight: z.number().nonnegative(),
  lastUpdated: z.number().int().positive(),
});

export type ValidatedReputationRecord = z.infer<typeof ReputationRecordSchema>;

// ============================================================================
// Evidence & Frozen Item Schemas
// ============================================================================

export const FrozenItemSchema = z.object({
  itemId: z.string().min(1).max(256),
  disputeId: z.string().min(1).max(256),
  itemType: z.enum(['intent', 'settlement', 'receipt', 'other']),
  originalData: z.record(z.unknown()),
  contentHash: z.string().min(1).max(256),
  frozenAt: z.number().int().positive(),
  frozenBy: z.string().min(1).max(256),
  status: z.enum(['active', 'under_dispute', 'dispute_resolved']),
  disputeResolution: z.string().max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough(); // Allow additional fields from actual type

export type ValidatedFrozenItem = z.infer<typeof FrozenItemSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Safe JSON parse with schema validation
 *
 * @param jsonString - JSON string to parse
 * @param schema - Zod schema to validate against
 * @returns Validated and parsed data
 * @throws ZodError if validation fails
 */
export function parseAndValidate<T>(jsonString: string, schema: z.ZodSchema<T>): T {
  const parsed = JSON.parse(jsonString);
  return schema.parse(parsed);
}

/**
 * Safe JSON parse with schema validation and error handling
 *
 * @param jsonString - JSON string to parse
 * @param schema - Zod schema to validate against
 * @returns Result object with success status and data or error
 */
export function safeParseAndValidate<T>(
  jsonString: string,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(jsonString);
    const validated = schema.parse(parsed);
    return { success: true, data: validated };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const zodError = error as z.ZodError;
      return {
        success: false,
        error: `Validation failed: ${zodError.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      };
    }
    return { success: false, error: `Parse failed: ${error.message}` };
  }
}

/**
 * Validate ID format to prevent path traversal
 *
 * IDs must be alphanumeric with hyphens/underscores only, no path separators
 */
export const SafeIDSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'ID must be alphanumeric with hyphens/underscores only').min(1).max(256);

/**
 * Sanitize filename to prevent path traversal
 *
 * @param filename - Filename to sanitize
 * @returns Sanitized filename safe for file operations
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators, null bytes, and other dangerous characters
  return filename.replace(/[\/\\.\0<>:"|?*]/g, '_');
}

/**
 * Validate file path is within allowed directory
 *
 * @param filePath - File path to validate
 * @param baseDir - Base directory that path must be within
 * @returns true if path is safe
 */
export function validatePathWithinDirectory(filePath: string, baseDir: string): boolean {
  const path = require('path');
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);

  return resolvedPath.startsWith(resolvedBase);
}
