/**
 * Core types for NatLangChain Mediator Node
 */

export type ConsensusMode = 'permissionless' | 'dpos' | 'poa' | 'hybrid';

export type IntentStatus = 'pending' | 'accepted' | 'rejected' | 'closed' | 'unalignable';

export type SettlementStatus = 'proposed' | 'accepted' | 'rejected' | 'closed' | 'challenged';

/**
 * Represents a user's intent on the chain
 */
export interface Intent {
  hash: string;
  author: string;
  prose: string;
  desires: string[];
  constraints: string[];
  offeredFee?: number;
  timestamp: number;
  status: IntentStatus;
  branch?: string; // e.g., "Professional/Engineering"
  flagCount?: number; // For unalignable tracking
}

/**
 * Proposed Settlement structure
 */
export interface ProposedSettlement {
  id: string;
  intentHashA: string;
  intentHashB: string;
  reasoningTrace: string;
  proposedTerms: {
    price?: number;
    deliverables?: string[];
    timelines?: string;
    escrowReference?: string;
    customTerms?: Record<string, any>;
  };
  facilitationFee: number;
  facilitationFeePercent: number;
  modelIntegrityHash: string;
  mediatorId: string;
  timestamp: number;
  status: SettlementStatus;
  acceptanceDeadline: number;

  // DPoS fields
  stakeReference?: string;
  delegationReference?: string;
  effectiveStake?: number;

  // PoA fields
  authoritySignature?: string;

  // Tracking
  partyAAccepted?: boolean;
  partyBAccepted?: boolean;
  challenges?: Challenge[];

  // Semantic Consensus Verification
  requiresVerification?: boolean;
  verificationRequest?: VerificationRequest;
  verificationResponses?: VerificationResponse[];
  verificationStatus?: VerificationStatus;
}

/**
 * Challenge against a proposed settlement
 */
export interface Challenge {
  id: string;
  settlementId: string;
  challengerId: string;
  contradictionProof: string;
  paraphraseEvidence: string;
  timestamp: number;
  status: 'pending' | 'upheld' | 'rejected';
  validators?: string[];
}

/**
 * Mediator reputation counters
 */
export interface MediatorReputation {
  mediatorId: string;
  successfulClosures: number;
  failedChallenges: number; // Challenges submitted that were rejected
  upheldChallengesAgainst: number; // Challenges against this mediator that were upheld
  forfeitedFees: number;
  weight: number; // Calculated weight
  lastUpdated: number;
}

/**
 * Stake information for DPoS
 */
export interface Stake {
  mediatorId: string;
  amount: number;
  delegatedAmount: number;
  effectiveStake: number;
  delegators: Delegation[];
  unbondingPeriod: number; // milliseconds
  status: 'bonded' | 'unbonding' | 'unbonded';
}

/**
 * Delegation information
 */
export interface Delegation {
  delegatorId: string;
  mediatorId: string;
  amount: number;
  timestamp: number;
  status: 'active' | 'undelegating' | 'withdrawn';
  undelegationDeadline?: number;
}

/**
 * Governance proposal
 */
export interface GovernanceProposal {
  id: string;
  proposerId: string;
  title: string;
  description: string;
  proposalType: 'parameter_change' | 'authority_add' | 'authority_remove' | 'mode_transition';
  parameters?: Record<string, any>;
  votingPeriodEnd: number;
  executionDelay: number;
  status: 'voting' | 'passed' | 'rejected' | 'executed';
  votes: {
    for: number;
    against: number;
    abstain: number;
  };
  quorumRequired: number;
  timestamp: number;
}

/**
 * Burn transaction types
 */
export type BurnType = 'base_filing' | 'escalated' | 'success' | 'load_scaled';

/**
 * Burn transaction record
 */
export interface BurnTransaction {
  id: string;
  type: BurnType;
  author: string; // Identity that triggered the burn
  amount: number; // Amount of tokens burned
  intentHash?: string; // Associated intent (if applicable)
  settlementId?: string; // Associated settlement (if applicable)
  multiplier?: number; // Multiplier applied (for escalated/load-scaled)
  timestamp: number;
  transactionHash?: string; // On-chain transaction reference
}

/**
 * User daily submission tracking
 */
export interface UserSubmissionRecord {
  userId: string;
  date: string; // YYYY-MM-DD format
  submissionCount: number;
  lastSubmissionTime: number;
  totalBurned: number;
  burns: BurnTransaction[];
}

/**
 * Configuration for the mediator node
 */
export interface MediatorConfig {
  chainEndpoint: string;
  chainId: string;
  consensusMode: ConsensusMode;

  llmProvider: 'anthropic' | 'openai' | 'custom';
  llmApiKey: string;
  llmModel: string;

  mediatorPrivateKey: string;
  mediatorPublicKey: string;
  facilitationFeePercent: number;

  bondedStakeAmount?: number;
  minEffectiveStake?: number;
  poaAuthorityKey?: string;

  vectorDbPath: string;
  vectorDimensions: number;
  maxIntentsCache: number;

  reputationChainEndpoint?: string;
  acceptanceWindowHours: number;

  // Burn configuration
  baseFilingBurn?: number; // Base burn amount for intent filing
  freeDailySubmissions?: number; // Free submissions per 24h (default: 1)
  burnEscalationBase?: number; // Base multiplier for escalation (default: 2)
  burnEscalationExponent?: number; // Exponent for escalation (default: 1)
  successBurnPercentage?: number; // Percentage burn on success (default: 0.05)
  loadScalingEnabled?: boolean; // Enable load-based scaling (default: false)
  maxLoadMultiplier?: number; // Maximum load multiplier (default: 10)
  enableBurnPreview?: boolean; // Show burn estimates before submission (default: true)

  // LoadMonitor configuration
  targetIntentRate?: number; // Target intents/minute baseline (default: 10)
  maxIntentRate?: number; // Maximum sustainable intents/minute (default: 50)
  loadSmoothingFactor?: number; // Smoothing for gradual adjustments 0-1 (default: 0.3)
  loadMonitoringInterval?: number; // Load check interval in ms (default: 30000)

  // Challenge submission configuration
  enableChallengeSubmission?: boolean; // Enable automatic challenge submission (default: false)
  minConfidenceToChallenge?: number; // Minimum confidence to submit challenge 0-1 (default: 0.8)
  challengeCheckInterval?: number; // How often to check for challengeable settlements in ms (default: 60000)

  // Semantic Consensus Verification configuration
  enableSemanticConsensus?: boolean; // Enable semantic consensus for high-value settlements (default: false)
  highValueThreshold?: number; // Settlement value threshold requiring verification (default: 10000)
  verificationDeadlineHours?: number; // Hours to wait for verification responses (default: 24)
  requiredVerifiers?: number; // Number of verifiers to select (default: 5)
  requiredConsensus?: number; // Minimum consensus for approval (default: 3)
  semanticSimilarityThreshold?: number; // Cosine similarity threshold for equivalence (default: 0.85)
  participateInVerification?: boolean; // Opt-in to participate as verifier (default: true)

  // Sybil Resistance configuration
  enableSybilResistance?: boolean; // Enable daily limits and deposits (default: false)
  dailyFreeLimit?: number; // Free intent submissions per day per author (default: 3)
  excessDepositAmount?: number; // Deposit required for 4th+ intent (default: 100 NLC)
  depositRefundDays?: number; // Days before deposit can be refunded (default: 30)
  enableSpamProofSubmission?: boolean; // Allow mediators to submit spam proofs (default: false)
  minSpamConfidence?: number; // Minimum confidence for spam classification (default: 0.9)

  // MP-02: Proof-of-Effort Receipt Protocol configuration
  enableEffortCapture?: boolean; // Enable effort capture and receipt generation (default: false)
  effortObserverId?: string; // Unique identifier for this observer instance
  effortCaptureModalities?: string[]; // Modalities to capture (default: ['text_edit', 'command'])
  effortSegmentationStrategy?: 'time_window' | 'activity_boundary' | 'hybrid'; // (default: 'time_window')
  effortTimeWindowMinutes?: number; // Time window for segmentation (default: 30)
  effortActivityGapMinutes?: number; // Activity gap for boundary detection (default: 10)
  effortAutoAnchor?: boolean; // Auto-anchor receipts to chain (default: true)
  effortEncryptSignals?: boolean; // Encrypt raw signals at rest (default: true)
  effortRetentionDays?: number; // Signal retention period (default: 90, 0 = indefinite)

  // MP-03: Dispute & Escalation Protocol configuration
  enableDisputeSystem?: boolean; // Enable dispute declaration and handling (default: false)
  allowDisputeClarification?: boolean; // Allow mediator-assisted clarification (default: true)
  autoFreezeEvidence?: boolean; // Auto-freeze contested items (default: true)
  maxClarificationDays?: number; // Max days for clarification phase (default: 14)
  requireHumanEscalation?: boolean; // Require human authorship for escalations (default: true)

  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Alignment candidate pair
 */
export interface AlignmentCandidate {
  intentA: Intent;
  intentB: Intent;
  similarityScore: number;
  estimatedValue: number;
  priority: number;
}

/**
 * Chain entry types
 */
export type ChainEntry =
  | { type: 'intent'; data: Intent }
  | { type: 'settlement'; data: ProposedSettlement }
  | { type: 'accept'; settlementId: string; party: string; signature: string }
  | { type: 'challenge'; data: Challenge }
  | { type: 'delegation'; data: Delegation }
  | { type: 'governance'; data: GovernanceProposal }
  | { type: 'payout'; settlementId: string; amount: number; recipient: string }
  | { type: 'burn'; data: BurnTransaction };

/**
 * LLM negotiation result
 */
export interface NegotiationResult {
  success: boolean;
  reasoning: string;
  proposedTerms: ProposedSettlement['proposedTerms'];
  confidenceScore: number;
  modelUsed: string;
  promptHash: string;
}

/**
 * Burn Analytics Types (Phase 6)
 */

export type TimeWindow = 'hour' | 'day' | 'week' | 'month' | 'all';

export interface BurnTimeSeriesData {
  timestamp: number;
  totalBurns: number;
  totalAmount: number;
  averageBurn: number;
  uniqueUsers: number;
  byType: {
    base_filing: number;
    escalated: number;
    success: number;
    load_scaled: number;
  };
}

export interface BurnTrendAnalysis {
  period: TimeWindow;
  dataPoints: BurnTimeSeriesData[];
  summary: {
    totalBurns: number;
    totalAmount: number;
    averageBurnPerTransaction: number;
    averageBurnPerUser: number;
    growthRate: number; // Percentage change from previous period
    peakBurnTime: number; // Timestamp of highest activity
    activeUsers: number;
  };
}

export interface UserBurnAnalytics {
  userId: string;
  totalBurns: number;
  totalAmount: number;
  averageBurn: number;
  firstBurn: number; // Timestamp
  lastBurn: number; // Timestamp
  burnsByType: Record<BurnType, number>;
  daysSinceFirstBurn: number;
  isActive: boolean; // Burned in last 7 days
}

export interface BurnLeaderboard {
  topBurnersByAmount: Array<{
    userId: string;
    totalAmount: number;
    burnCount: number;
  }>;
  topBurnersByVolume: Array<{
    userId: string;
    burnCount: number;
    totalAmount: number;
  }>;
  mostRecentBurners: Array<{
    userId: string;
    lastBurnTime: number;
    lastBurnAmount: number;
  }>;
}

export interface DashboardMetrics {
  overview: {
    totalBurnsAllTime: number;
    totalAmountBurned: number;
    totalActiveUsers: number;
    averageBurnPerUser: number;
  };
  today: {
    burns: number;
    amount: number;
    uniqueUsers: number;
    averageBurn: number;
  };
  thisWeek: {
    burns: number;
    amount: number;
    uniqueUsers: number;
    growthVsLastWeek: number; // Percentage
  };
  thisMonth: {
    burns: number;
    amount: number;
    uniqueUsers: number;
    growthVsLastMonth: number; // Percentage
  };
  distribution: {
    byType: Record<BurnType, { count: number; amount: number; percentage: number }>;
    byTimeOfDay: Array<{ hour: number; burns: number; amount: number }>;
  };
  loadMetrics: {
    averageMultiplier: number;
    peakMultiplier: number;
    currentMultiplier: number;
    multiplierHistory: Array<{ timestamp: number; multiplier: number }>;
  };
}

export interface BurnForecast {
  period: TimeWindow;
  projectedBurns: number;
  projectedAmount: number;
  confidence: number; // 0-1
  basedOnDataPoints: number;
}

/**
 * Challenge Detection and Submission Types
 */

/**
 * Result of analyzing a settlement for semantic contradictions
 */
export interface ContradictionAnalysis {
  hasContradiction: boolean;
  confidence: number; // 0-1, how confident we are in the contradiction
  violatedConstraints: string[]; // Which constraints from original intents were violated
  contradictionProof: string; // Natural language explanation of the contradiction
  paraphraseEvidence: string; // LLM-generated paraphrase showing the violation
  affectedParty: 'A' | 'B' | 'both'; // Which party's intent was violated
  severity: 'minor' | 'moderate' | 'severe'; // How severe the violation is
}

/**
 * Result of submitting a challenge to the chain
 */
export interface ChallengeSubmissionResult {
  success: boolean;
  challengeId?: string;
  error?: string;
  timestamp: number;
}

/**
 * Tracking record for challenges submitted by this mediator
 */
export interface ChallengeHistory {
  challengeId: string;
  settlementId: string;
  targetMediatorId: string;
  submittedAt: number;
  status: 'pending' | 'upheld' | 'rejected';
  contradictionAnalysis: ContradictionAnalysis;
  lastChecked: number;
}

/**
 * Semantic Consensus Verification Types
 */

/**
 * Status of semantic consensus verification
 */
export type VerificationStatus =
  | 'pending'           // Waiting for verification responses
  | 'in_progress'       // Verifiers selected, awaiting responses
  | 'consensus_reached' // 3+ semantically equivalent summaries
  | 'consensus_failed'  // Failed to reach consensus
  | 'timeout'           // Verification deadline passed
  | 'not_required';     // Settlement below threshold

/**
 * Request for semantic verification from selected mediators
 */
export interface VerificationRequest {
  settlementId: string;
  requesterId: string;
  intentHashA: string;
  intentHashB: string;
  proposedTerms: ProposedSettlement['proposedTerms'];
  settlementValue: number;
  selectedVerifiers: string[]; // 5 mediator IDs selected via weighted random
  requestedAt: number;
  responseDeadline: number; // Timestamp
  signature: string;
}

/**
 * Response from a verifier mediator
 */
export interface VerificationResponse {
  settlementId: string;
  verifierId: string;
  semanticSummary: string; // Natural language summary of settlement semantics
  summaryEmbedding: number[]; // Embedding vector for similarity comparison
  approves: boolean; // Whether verifier approves the settlement
  confidence: number; // 0-1, verifier's confidence in their summary
  timestamp: number;
  signature: string;
}

/**
 * Result of semantic equivalence check between summaries
 */
export interface SemanticEquivalenceResult {
  summary1: string;
  summary2: string;
  cosineSimilarity: number; // 0-1
  areEquivalent: boolean; // true if similarity >= threshold
  threshold: number; // The threshold used for comparison
}

/**
 * Complete verification record for a settlement
 */
export interface SemanticVerification {
  settlementId: string;
  status: VerificationStatus;
  request: VerificationRequest;
  responses: VerificationResponse[];
  equivalenceResults: SemanticEquivalenceResult[];
  consensusReached: boolean;
  consensusCount: number; // Number of semantically equivalent summaries
  requiredConsensus: number; // Typically 3
  completedAt?: number;
}

/**
 * Sybil Resistance - Submission tracking and deposit management
 */

/**
 * Daily submission record for an author
 */
export interface DailySubmissionRecord {
  author: string;
  date: string; // YYYY-MM-DD format
  submissionCount: number;
  freeSubmissionsRemaining: number;
  depositsPaid: DepositRecord[];
}

/**
 * Deposit record for excess submissions
 */
export interface DepositRecord {
  depositId: string;
  author: string;
  intentHash: string;
  amount: number; // Deposit amount in NLC
  submittedAt: number; // Timestamp
  refundDeadline: number; // Timestamp (submittedAt + refund period)
  status: 'active' | 'refunded' | 'forfeited';
  refundedAt?: number;
  forfeitedAt?: number;
  spamProofId?: string; // If forfeited, reference to spam proof
}

/**
 * Spam proof submission against an intent
 */
export interface SpamProof {
  proofId: string;
  targetIntentHash: string;
  targetAuthor: string;
  submitterId: string;
  evidence: string; // Prose explanation of why intent is spam
  confidence: number; // 0-1, LLM confidence in spam classification
  submittedAt: number;
  status: 'pending' | 'validated' | 'rejected';
  validatedAt?: number;
  depositForfeited?: number; // Amount forfeited if validated
}

/**
 * Submission limit check result
 */
export interface SubmissionLimitResult {
  allowed: boolean;
  isFree: boolean; // true if within free limit
  requiresDeposit: boolean;
  depositAmount?: number;
  freeSubmissionsRemaining: number;
  dailyCount: number;
  reason?: string; // Why submission was blocked (if !allowed)
}

// ============================================================================
// MP-02: Proof-of-Effort Receipt Protocol Types
// ============================================================================

/**
 * Signal modality types
 */
export type SignalModality = 'text_edit' | 'command' | 'voice' | 'structured_tool' | 'other';

/**
 * Raw observable trace of effort
 */
export interface Signal {
  signalId: string; // Unique signal identifier
  modality: SignalModality;
  timestamp: number;
  content: string; // Raw signal content
  metadata?: Record<string, any>; // Additional context (file path, command, etc.)
  hash: string; // SHA-256 hash of content
}

/**
 * Effort segment status
 */
export type SegmentStatus = 'active' | 'complete' | 'validated' | 'anchored';

/**
 * Bounded time slice of signals treated as unit of analysis
 */
export interface EffortSegment {
  segmentId: string;
  startTime: number;
  endTime: number;
  signals: Signal[];
  status: SegmentStatus;
  humanMarker?: string; // Optional human-provided marker
  segmentationRule: string; // How this segment was created (time_window, activity_boundary, human_marker)
}

/**
 * Validation assessment from LLM
 */
export interface ValidationAssessment {
  validatorId: string; // LLM model identifier
  modelVersion: string;
  timestamp: number;
  coherenceScore: number; // 0-1, linguistic coherence
  progressionScore: number; // 0-1, conceptual progression
  consistencyScore: number; // 0-1, internal consistency
  synthesisScore: number; // 0-1, synthesis vs duplication (0=duplicate, 1=original)
  summary: string; // Deterministic effort summary
  uncertaintyFlags: string[]; // Areas of uncertainty or ambiguity
  evidence: string; // Supporting evidence for scores
}

/**
 * Receipt status
 */
export type ReceiptStatus = 'draft' | 'validated' | 'anchored' | 'verified';

/**
 * Cryptographic record attesting effort occurred
 */
export interface EffortReceipt {
  receiptId: string; // UUID + hash
  segmentId: string;
  startTime: number;
  endTime: number;
  signalHashes: string[]; // Hashes of all signals in segment
  validation: ValidationAssessment;
  observerId: string; // System/component that captured signals
  validatorId: string; // LLM model that validated
  receiptHash: string; // SHA-256 of receipt contents
  status: ReceiptStatus;
  anchoredAt?: number; // Timestamp when anchored to ledger
  ledgerReference?: string; // Chain/ledger reference
  priorReceipts?: string[]; // References to previous receipts
  externalArtifacts?: string[]; // References to external work products
  metadata?: Record<string, any>;
}

/**
 * Receipt verification result
 */
export interface ReceiptVerification {
  receiptId: string;
  isValid: boolean;
  hashMatches: boolean;
  ledgerConfirmed: boolean;
  validationReproducible: boolean;
  issues: string[]; // Any verification issues found
  verifiedAt: number;
}

/**
 * Effort capture configuration
 */
export interface EffortCaptureConfig {
  enabled: boolean;
  observerId: string; // Unique identifier for this observer instance
  captureModalities: SignalModality[];
  segmentationStrategy: 'time_window' | 'activity_boundary' | 'hybrid';
  timeWindowMinutes?: number; // For time_window strategy
  activityGapMinutes?: number; // For activity_boundary strategy
  autoAnchor: boolean; // Automatically anchor receipts
  encryptSignals: boolean; // Encrypt raw signals at rest
  retentionDays?: number; // How long to keep raw signals (0 = indefinite)
}

// ============================================================================
// MP-03: Dispute & Escalation Protocol Types
// ============================================================================

/**
 * Dispute status
 */
export type DisputeStatus = 'initiated' | 'under_review' | 'clarifying' | 'escalated' | 'resolved' | 'dismissed';

/**
 * Dispute party role
 */
export type DisputePartyRole = 'claimant' | 'respondent';

/**
 * Dispute party
 */
export interface DisputeParty {
  partyId: string; // Public key or identifier
  role: DisputePartyRole;
  name?: string;
  contactInfo?: string;
}

/**
 * Contested item reference
 */
export interface ContestedItem {
  itemType: 'intent' | 'settlement' | 'receipt' | 'agreement' | 'delegation';
  itemId: string; // Hash or ID of the contested item
  itemHash?: string; // Hash of the item for verification
}

/**
 * Dispute evidence
 */
export interface DisputeEvidence {
  evidenceId: string;
  disputeId: string;
  submittedBy: string; // Party ID
  timestamp: number;
  evidenceType: 'document' | 'statement' | 'witness' | 'artifact' | 'other';
  description: string;
  contentHash?: string; // Hash of evidence content
  linkedItems?: string[]; // References to other items
  metadata?: Record<string, any>;
}

/**
 * Dispute declaration
 */
export interface DisputeDeclaration {
  disputeId: string;
  claimant: DisputeParty;
  respondent?: DisputeParty; // May not be known at declaration time
  contestedItems: ContestedItem[];
  issueDescription: string; // Natural language description
  desiredEscalationPath?: string; // e.g., "arbitration", "DAO", "court"
  status: DisputeStatus;
  initiatedAt: number;
  updatedAt: number;
  evidence: DisputeEvidence[];
  clarificationRecord?: ClarificationRecord;
  escalation?: EscalationDeclaration;
  resolution?: DisputeResolution;
}

/**
 * Clarification record from mediator-assisted phase
 */
export interface ClarificationRecord {
  clarificationId: string;
  disputeId: string;
  mediatorId: string; // LLM model identifier
  startedAt: number;
  completedAt?: number;
  claimantStatements: string[]; // Structured claims
  respondentStatements: string[]; // Structured counterclaims
  factualDisagreements: string[]; // Points of factual disagreement
  interpretiveDisagreements: string[]; // Points of interpretive disagreement
  scopeNarrowing?: string; // Suggested narrowed scope
  ambiguities: string[]; // Identified ambiguities
  participationConsent: {
    claimant: boolean;
    respondent: boolean;
  };
}

/**
 * Escalation authority types
 */
export type EscalationAuthorityType = 'arbitrator' | 'dao' | 'court' | 'review_board' | 'custom';

/**
 * Escalation authority
 */
export interface EscalationAuthority {
  authorityId: string;
  authorityType: EscalationAuthorityType;
  name: string;
  description?: string;
  contactInfo?: string;
  jurisdiction?: string;
  website?: string;
}

/**
 * Escalation declaration
 */
export interface EscalationDeclaration {
  escalationId: string;
  disputeId: string;
  escalatedBy: string; // Party ID
  targetAuthority: EscalationAuthority;
  scopeOfIssues: string[]; // Specific issues being escalated
  escalatedAt: number;
  humanAuthorship: boolean; // Must be true
  signature?: string; // Cryptographic signature
  packageId?: string; // Reference to dispute package
}

/**
 * Dispute package (bundled records for escalation)
 */
export interface DisputePackage {
  packageId: string;
  disputeId: string;
  createdAt: number;
  createdBy: string;
  summary: string; // Human-readable summary
  timeline: DisputeTimelineEntry[];
  bundledRecords: {
    intents: Intent[];
    settlements: ProposedSettlement[];
    receipts: EffortReceipt[];
    evidence: DisputeEvidence[];
    clarifications: ClarificationRecord[];
  };
  packageHash: string; // SHA-256 of package contents
  completenessVerified: boolean;
  exportFormats?: {
    json?: string; // JSON export path
    pdf?: string; // PDF export path
    zip?: string; // ZIP archive path
  };
}

/**
 * Dispute timeline entry
 */
export interface DisputeTimelineEntry {
  timestamp: number;
  eventType: 'initiated' | 'evidence_added' | 'clarification_started' | 'clarification_completed' | 'escalated' | 'resolved';
  actor: string;
  description: string;
  referenceId?: string;
}

/**
 * Dispute resolution (external judgment recording)
 */
export interface DisputeResolution {
  resolutionId: string;
  disputeId: string;
  resolvedAt: number;
  resolvedBy: string; // Authority or party
  outcome: 'claimant_favored' | 'respondent_favored' | 'compromise' | 'dismissed' | 'other';
  outcomeDescription: string;
  externalReferences?: string[]; // Links to legal documents, rulings, etc.
  reputationImpact?: {
    claimant: number;
    respondent: number;
  };
  annotations?: string[];
  isImmutable: boolean; // Must be true once recorded
}

/**
 * Dispute configuration
 */
export interface DisputeConfig {
  enableDisputeSystem: boolean;
  allowClarification: boolean;
  autoFreezeEvidence: boolean; // Automatically mark items as UNDER_DISPUTE
  escalationAuthorities: EscalationAuthority[];
  maxClarificationDays?: number; // Time limit for clarification phase
  requireHumanEscalation: boolean; // Require human authorship for escalation
}