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
  executionTime?: number; // When proposal can be executed (after delay)
  status: 'voting' | 'passed' | 'rejected' | 'executed' | 'expired';
  votes: {
    for: number;
    against: number;
    abstain: number;
  };
  quorumRequired: number;
  timestamp: number;
  prose?: string; // Prose description for chain submission
}

/**
 * Individual vote cast by a mediator
 */
export interface GovernanceVote {
  id: string;
  proposalId: string;
  voterId: string;
  voteType: 'for' | 'against' | 'abstain';
  votingPower: number; // Stake-weighted voting power
  timestamp: number;
  signature?: string;
}

/**
 * Governance configuration
 */
export interface GovernanceConfig {
  votingPeriodDays: number; // Default: 7 days
  executionDelayDays: number; // Default: 3 days
  quorumPercentage: number; // Default: 30%
  approvalThreshold: number; // Default: 50% (simple majority)
  proposalSubmissionMinStake?: number; // Minimum stake to submit proposal
}

/**
 * Governance proposal submission result
 */
export interface GovernanceProposalSubmissionResult {
  success: boolean;
  proposalId?: string;
  error?: string;
  timestamp: number;
}

/**
 * Governance vote submission result
 */
export interface GovernanceVoteSubmissionResult {
  success: boolean;
  voteId?: string;
  error?: string;
  timestamp: number;
}

/**
 * Governable parameters
 */
export interface GovernableParameters {
  // DPoS parameters
  dposActiveSlots?: number;
  dposMinimumStake?: number;
  dposRotationPeriodHours?: number;
  dposSlashingPercentage?: number;

  // Fee parameters
  facilitationFeePercent?: number;
  minimumFacilitationFee?: number;

  // Challenge parameters
  challengeWindow?: number;
  minConfidenceToChallenge?: number;

  // Acceptance parameters
  acceptanceWindowHours?: number;

  // Semantic consensus parameters
  semanticConsensusMinMediators?: number;
  semanticConsensusTimeoutMs?: number;

  // Reputation parameters
  closuresWeight?: number;
  challengesUpheldWeight?: number;
  challengesFailedPenalty?: number;
  forfeituresWeight?: number;

  // Monitoring parameters
  monitoringHealthCheckInterval?: number;
  monitoringMetricsInterval?: number;
  monitoringHighLatencyThreshold?: number;
  monitoringHighErrorRateThreshold?: number;
  monitoringHighMemoryThreshold?: number;

  // Burn parameters
  baseBurnAmount?: number;
  successBurnAmount?: number;
  dailyFreeIntentAllowance?: number;
  perUserExponentBase?: number;
  loadMonitoringInterval?: number;

  // Consensus mode
  consensusMode?: 'permissionless' | 'dpos' | 'poa' | 'hybrid';
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

  // Network coordination
  httpEndpoint?: string;
  port?: number;
  coordinationEndpoints?: string[];
  additionalChains?: any[];
  webSocketEndpoint?: string;

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

  // MP-04: Licensing & Delegation Protocol configuration
  enableLicensingSystem?: boolean; // Enable licensing and delegation (default: false)
  requireHumanRatification?: boolean; // Require human authorship for ratification (default: true)
  defaultLicenseDuration?: number; // Default license duration in days (default: 365)
  maxDelegationDepth?: number; // Maximum redelegation depth (default: 3)
  autoExpireCheck?: boolean; // Auto-check and expire licenses/delegations (default: true)
  enableViolationTracking?: boolean; // Track scope violations (default: true)

  // MP-05: Settlement & Capitalization Interface configuration
  enableSettlementSystem?: boolean; // Enable settlement and capitalization (default: false)
  requireMutualSettlement?: boolean; // Require all parties to declare (default: true)
  allowPartialSettlement?: boolean; // Allow staged/milestone settlements (default: true)
  enableCapitalization?: boolean; // Enable capitalization events (default: false)
  enableRiskTracking?: boolean; // Track settlement risks (default: true)
  autoValidatePreconditions?: boolean; // Auto-check MP-01/02/03/04 preconditions (default: true)

  // WebSocket Real-Time Updates configuration
  enableWebSocket?: boolean; // Enable WebSocket server for real-time events (default: false)
  webSocketPort?: number; // Port for WebSocket server (default: 8080)
  webSocketHost?: string; // Host for WebSocket server (default: '0.0.0.0')
  webSocketAuthRequired?: boolean; // Require authentication for WebSocket connections (default: true)
  webSocketMaxConnections?: number; // Maximum concurrent WebSocket connections (default: 1000)
  webSocketHeartbeatInterval?: number; // Heartbeat interval in ms (default: 30000)

  // Monitoring & Analytics configuration
  enableMonitoring?: boolean; // Enable health and performance monitoring (default: true)
  monitoringHealthCheckInterval?: number; // Health check interval in ms (default: 30000)
  monitoringMetricsInterval?: number; // Performance metrics interval in ms (default: 10000)
  monitoringSnapshotRetention?: number; // Number of performance snapshots to keep (default: 100)
  monitoringHighLatencyThreshold?: number; // High latency alert threshold in ms (default: 1000)
  monitoringHighErrorRateThreshold?: number; // High error rate threshold per minute (default: 10)
  monitoringHighMemoryThreshold?: number; // High memory usage threshold percentage (default: 90)

  // Governance configuration
  enableGovernance?: boolean; // Enable on-chain governance system (default: false)
  governanceVotingPeriodDays?: number; // Voting period for proposals in days (default: 7)
  governanceExecutionDelayDays?: number; // Execution delay after approval in days (default: 3)
  governanceQuorumPercentage?: number; // Quorum required for proposal validity (default: 30)
  governanceApprovalThreshold?: number; // Approval threshold percentage (default: 50)
  governanceProposalMinStake?: number; // Minimum stake to submit proposals (default: 1000)
  governanceMonitoringInterval?: number; // Proposal monitoring interval in ms (default: 3600000 - 1 hour)

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
  reason?: string; // Optional explanation for the match
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

// ============================================================================
// MP-04: Licensing & Delegation Protocol Types
// ============================================================================

/**
 * License status
 */
export type LicenseStatus = 'proposed' | 'ratified' | 'active' | 'expired' | 'revoked';

/**
 * Subject type for licensing
 */
export type SubjectType = 'receipt' | 'artifact' | 'agreement' | 'settlement' | 'intent' | 'other';

/**
 * License scope definition
 */
export interface LicenseScope {
  subject: {
    type: SubjectType;
    ids: string[]; // Receipt IDs, artifact IDs, agreement IDs, etc.
  };
  purpose: string; // Allowed use cases (natural language)
  limits: string[]; // Prohibited actions
  duration: {
    type: 'perpetual' | 'time_bounded';
    expiresAt?: number; // Timestamp for time_bounded
  };
  transferability: {
    sublicenseAllowed: boolean;
    redelegationAllowed: boolean;
  };
}

/**
 * License grant
 */
export interface License {
  licenseId: string;
  grantorId: string; // Human or institution issuing license
  granteeId: string; // Recipient of license
  scope: LicenseScope;
  status: LicenseStatus;

  // Lifecycle
  proposedAt: number;
  proposedBy: string; // May differ from grantor (counterparty/mediator can propose)
  ratifiedAt?: number;
  ratificationStatement?: string; // Natural language ratification by grantor
  activatedAt?: number;

  // Revocation
  revokedAt?: number;
  revocationStatement?: string;
  revocationSignature?: string;

  // Immutable references
  underlyingReferences: string[]; // Hashes of receipts, agreements, etc.
  licenseHash: string; // SHA-256 of license contents

  // Metadata
  humanAuthorship: boolean; // Must be true for ratification
  signature?: string;
}

/**
 * Delegation status
 */
export type DelegationStatus = 'proposed' | 'ratified' | 'active' | 'expired' | 'revoked';

/**
 * Delegation scope definition
 */
export interface DelegationScope {
  delegatedPowers: string[]; // Specific powers granted (natural language)
  constraints: string[]; // Limitations on delegated powers
  revocationConditions: string[]; // Conditions triggering auto-revocation
  duration: {
    type: 'perpetual' | 'time_bounded';
    expiresAt?: number;
  };
  transferability: {
    redelegationAllowed: boolean;
    maxRedelegationDepth?: number; // Maximum chain depth
  };
}

/**
 * Delegation grant (MP-04)
 */
export interface DelegationGrant {
  delegationId: string;
  delegatorId: string; // Human delegating authority
  delegateId: string; // Agent or human receiving authority
  scope: DelegationScope;
  status: DelegationStatus;

  // Lifecycle
  proposedAt: number;
  proposedBy: string;
  ratifiedAt?: number;
  ratificationStatement?: string; // Natural language ratification
  activatedAt?: number;

  // Revocation
  revokedAt?: number;
  revocationStatement?: string;
  revocationSignature?: string;

  // Redelegation chain
  parentDelegationId?: string; // If this is a redelegation
  redelegationDepth: number; // 0 = original delegation

  // Metadata
  humanAuthorship: boolean; // Must be true for ratification
  signature?: string;
  delegationHash: string; // SHA-256 of delegation contents
}

/**
 * Violation type
 */
export type ViolationType =
  | 'license_scope_violation'
  | 'unauthorized_redelegation'
  | 'purpose_violation'
  | 'expired_authority'
  | 'revoked_authority';

/**
 * Scope violation record
 */
export interface ScopeViolation {
  violationId: string;
  type: ViolationType;
  licenseId?: string;
  delegationId?: string;
  violatorId: string;
  violationDescription: string;
  detectedAt: number;
  evidence?: string[]; // References to proof of violation
  disputeId?: string; // If escalated to MP-03
}

/**
 * Delegated action record
 */
export interface DelegatedAction {
  actionId: string;
  delegationId: string;
  delegateId: string;
  actionType: string; // e.g., "negotiation", "settlement_proposal", "license_grant"
  actionDescription: string;
  performedAt: number;
  withinScope: boolean; // Whether action was within delegation scope
  referencedGrant: string; // Must reference the delegation grant
  actionHash: string; // SHA-256 of action contents
  violationId?: string; // If action violated scope
}

// ============================================================================
// MP-05: Settlement & Capitalization Interface Types
// ============================================================================

/**
 * MP-05 Settlement status
 */
export type MP05SettlementStatus =
  | 'declared'      // Initial declaration by one or more parties
  | 'ratified'      // All required parties have declared
  | 'finalized'     // Settlement is complete and immutable
  | 'contested'     // Under dispute (MP-03)
  | 'reversed';     // Reversed by new declaration

/**
 * Value type for capitalization
 */
export type ValueType =
  | 'payment_claim'
  | 'revenue_share'
  | 'equity_interest'
  | 'token'
  | 'contractual_right'
  | 'other';

/**
 * Settlement stage for partial/milestone settlements
 */
export interface SettlementStage {
  stageId: string;
  stageNumber: number;
  description: string;
  completionCriteria: string;
  valuePercentage?: number; // % of total value
  completedAt?: number;
  completedBy?: string;
}

/**
 * Individual party's settlement declaration
 */
export interface SettlementDeclaration {
  declarationId: string;
  settlementId: string;
  declaringPartyId: string;
  declarationStatement: string; // Natural language statement
  referencedAgreements: string[]; // Agreement IDs from MP-01
  referencedReceipts: string[]; // Receipt IDs from MP-02
  referencedLicenses?: string[]; // License IDs from MP-04
  valueDescription?: string; // Description of value realized
  declaredAt: number;
  humanAuthorship: boolean;
  signature?: string;
  declarationHash: string;
}

/**
 * Settlement record - immutable record of completed settlement
 */
export interface Settlement {
  settlementId: string;
  status: MP05SettlementStatus;

  // References to upstream artifacts
  referencedAgreements: string[]; // MP-01 agreements
  referencedReceipts: string[]; // MP-02 receipts
  referencedLicenses?: string[]; // MP-04 licenses
  referencedDelegations?: string[]; // MP-04 delegations

  // Parties and declarations
  requiredParties: string[]; // Parties that must declare
  declarations: SettlementDeclaration[]; // Individual declarations

  // Settlement details
  settlementStatement: string; // Overall settlement description
  valueDescription?: string; // Description of value realized

  // Lifecycle
  initiatedAt: number;
  initiatedBy: string;
  ratifiedAt?: number; // When all parties declared
  finalizedAt?: number; // When settlement became immutable

  // Staged settlement support
  isStaged: boolean;
  stages?: SettlementStage[];
  currentStage?: number;

  // Dispute integration (MP-03)
  contestedAt?: number;
  disputeId?: string;
  reversedAt?: number;
  reversalSettlementId?: string; // ID of reversal settlement

  // Metadata
  settlementHash: string; // SHA-256 of settlement contents
  immutable: boolean; // True when finalized
}

/**
 * Capitalization event - transformation into value instrument
 */
export interface CapitalizationEvent {
  eventId: string;
  settlementId: string;
  valueType: ValueType;

  // Value details
  amount?: string; // Numeric amount if applicable
  formula?: string; // Formula for calculated value
  rights?: string[]; // Specific rights granted
  conditions?: string[]; // Vesting or other conditions

  // Parties
  beneficiaries: string[]; // Who receives value
  issuedBy: string;

  // External execution
  externalReferences?: {
    blockchain?: string; // Chain identifier
    contractAddress?: string;
    transactionHash?: string;
    legalInstrument?: string;
    accountingReference?: string;
  };

  // Lifecycle
  createdAt: number;
  executedAt?: number;

  // Metadata
  eventHash: string;
}

/**
 * Capitalization interface - structured output for external systems
 */
export interface CapitalizationInterface {
  interfaceId: string;
  settlementId: string;
  eventId: string;

  // Structured data for external consumption
  valueType: ValueType;
  amount?: string;
  currency?: string;
  beneficiaries: {
    partyId: string;
    percentage?: number;
    amount?: string;
    rights?: string[];
  }[];

  // Conditions and vesting
  conditions?: {
    type: string;
    description: string;
    dueDate?: number;
  }[];

  // Audit trail
  upstreamReferences: {
    agreements: string[];
    receipts: string[];
    licenses?: string[];
  };

  // Execution hints
  executionHints?: {
    smartContractABI?: string;
    paymentInstructions?: string;
    legalTemplate?: string;
  };

  createdAt: number;
  interfaceHash: string;
}

/**
 * Settlement risk record - tracks potential abuse
 */
export interface SettlementRisk {
  riskId: string;
  settlementId: string;
  riskType:
    | 'premature_settlement'        // Declared before preconditions met
    | 'disputed_conditions'         // Settlement under active dispute
    | 'missing_references'          // Capitalization without valid upstream refs
    | 'unauthorized_declaration'    // Declaration by non-party
    | 'double_settlement';          // Same artifacts settled multiple times

  description: string;
  detectedAt: number;
  severity: 'low' | 'medium' | 'high';
  resolved: boolean;
  resolvedAt?: number;
  evidence?: string[];
}

/**
 * ============================================================================
 * WebSocket Real-Time Events System
 * ============================================================================
 */

/**
 * Event types for real-time notifications
 */
export type WebSocketEventType =
  // Intent events
  | 'intent.submitted'
  | 'intent.accepted'
  | 'intent.rejected'
  | 'intent.closed'
  | 'intent.unalignable'

  // Settlement events (legacy ProposedSettlement)
  | 'settlement.proposed'
  | 'settlement.accepted'
  | 'settlement.rejected'
  | 'settlement.challenged'
  | 'settlement.closed'

  // MP-05 Settlement events
  | 'mp05.settlement.initiated'
  | 'mp05.settlement.declared'
  | 'mp05.settlement.ratified'
  | 'mp05.settlement.finalized'
  | 'mp05.settlement.contested'
  | 'mp05.settlement.reversed'
  | 'mp05.settlement.stage_completed'

  // MP-05 Capitalization events
  | 'mp05.capitalization.event_created'
  | 'mp05.capitalization.interface_generated'
  | 'mp05.capitalization.executed'

  // Receipt events (MP-02)
  | 'receipt.created'
  | 'receipt.validated'
  | 'receipt.anchored'
  | 'receipt.verified'
  | 'receipt.signal_added'
  | 'receipt.segment_completed'

  // Dispute events (MP-03)
  | 'dispute.initiated'
  | 'dispute.under_review'
  | 'dispute.clarifying'
  | 'dispute.escalated'
  | 'dispute.resolved'
  | 'dispute.dismissed'
  | 'dispute.evidence_submitted'
  | 'dispute.clarification_provided'

  // License events (MP-04)
  | 'license.proposed'
  | 'license.ratified'
  | 'license.active'
  | 'license.expired'
  | 'license.revoked'
  | 'license.violation_detected'

  // Delegation events (MP-04)
  | 'delegation.proposed'
  | 'delegation.ratified'
  | 'delegation.active'
  | 'delegation.expired'
  | 'delegation.revoked'
  | 'delegation.violation_detected'
  | 'delegation.action_delegated'

  // Burn events (MP-06)
  | 'burn.executed'
  | 'burn.escalated'
  | 'burn.load_scaled'
  | 'burn.success_burn'

  // Challenge events
  | 'challenge.submitted'
  | 'challenge.upheld'
  | 'challenge.rejected'

  // Reputation events
  | 'reputation.updated'
  | 'reputation.weight_changed'

  // Verification events
  | 'verification.requested'
  | 'verification.response_received'
  | 'verification.completed'
  | 'verification.failed'

  // System events
  | 'system.load_pressure_changed'
  | 'system.config_updated'
  | 'system.node_status_changed'
  | 'system.health_update'
  | 'system.metrics_snapshot';

/**
 * Base structure for all WebSocket messages
 */
export interface WebSocketMessage<T = any> {
  type: WebSocketEventType;
  timestamp: number;
  payload: T;
  eventId: string;
  version: string; // Protocol version
}

/**
 * Intent event payloads
 */
export interface IntentEventPayload {
  intent: Intent;
  previousStatus?: IntentStatus;
}

/**
 * Settlement event payloads (legacy)
 */
export interface SettlementEventPayload {
  settlement: ProposedSettlement;
  previousStatus?: SettlementStatus;
  party?: string; // For acceptance/rejection events
}

/**
 * MP-05 Settlement event payloads
 */
export interface MP05SettlementEventPayload {
  settlement: Settlement;
  previousStatus?: MP05SettlementStatus;
  declaringParty?: string;
  declaration?: SettlementDeclaration;
  stageNumber?: number;
}

/**
 * MP-05 Capitalization event payloads
 */
export interface MP05CapitalizationEventPayload {
  event?: CapitalizationEvent;
  interface?: CapitalizationInterface;
  settlementId: string;
  valueType?: ValueType;
}

/**
 * Receipt event payloads (MP-02)
 */
export interface ReceiptEventPayload {
  receipt: EffortReceipt;
  previousStatus?: ReceiptStatus;
  signal?: Signal;
  segment?: EffortSegment;
}

/**
 * Dispute event payloads (MP-03)
 */
export interface DisputeEventPayload {
  dispute: DisputeDeclaration;
  previousStatus?: DisputeStatus;
  evidence?: DisputeEvidence;
  clarification?: ClarificationRecord;
  escalation?: EscalationDeclaration;
  resolution?: DisputeResolution;
}

/**
 * License event payloads (MP-04)
 */
export interface LicenseEventPayload {
  license: License;
  previousStatus?: LicenseStatus;
  violation?: ScopeViolation;
}

/**
 * Delegation event payloads (MP-04)
 */
export interface DelegationEventPayload {
  delegation: DelegationGrant;
  previousStatus?: DelegationStatus;
  violation?: ScopeViolation;
  action?: DelegatedAction;
}

/**
 * Burn event payloads (MP-06)
 */
export interface BurnEventPayload {
  burn: BurnTransaction;
  userRecord?: UserSubmissionRecord;
  loadMultiplier?: number;
  escalationMultiplier?: number;
}

/**
 * Challenge event payloads
 */
export interface ChallengeEventPayload {
  challenge: Challenge;
  previousStatus?: 'pending' | 'upheld' | 'rejected';
  settlement?: ProposedSettlement;
}

/**
 * Reputation event payloads
 */
export interface ReputationEventPayload {
  reputation: MediatorReputation;
  previousWeight?: number;
  changeReason: string;
}

/**
 * Verification event payloads
 */
export interface VerificationEventPayload {
  request?: VerificationRequest;
  response?: VerificationResponse;
  settlementId: string;
  status: VerificationStatus;
  result?: SemanticEquivalenceResult;
}

/**
 * System event payloads
 */
export interface SystemEventPayload {
  loadMultiplier?: number;
  currentLoad?: number;
  configKey?: string;
  configValue?: any;
  nodeStatus?: 'active' | 'paused' | 'maintenance' | 'error';
  message?: string;
}

/**
 * WebSocket connection metadata
 */
export interface WebSocketConnection {
  connectionId: string;
  identity: string;
  connectedAt: number;
  lastActivity: number;
  subscriptions: WebSocketSubscription[];
  authenticated: boolean;
  metadata?: Record<string, any>;
}

/**
 * Subscription configuration
 */
export interface WebSocketSubscription {
  subscriptionId: string;
  topics: WebSocketEventType[];
  filters?: {
    parties?: string[];        // Only events involving these parties
    intentHashes?: string[];   // Only events for specific intents
    settlementIds?: string[];  // Only events for specific settlements
    receiptIds?: string[];     // Only events for specific receipts
    disputeIds?: string[];     // Only events for specific disputes
    licenseIds?: string[];     // Only events for specific licenses
    delegationIds?: string[];  // Only events for specific delegations
    minSeverity?: 'low' | 'medium' | 'high'; // For risk/violation events
  };
}

/**
 * Subscription request from client
 */
export interface SubscriptionRequest {
  action: 'subscribe' | 'unsubscribe' | 'update';
  subscriptionId?: string;
  topics?: WebSocketEventType[];
  filters?: WebSocketSubscription['filters'];
}

/**
 * Subscription response to client
 */
export interface SubscriptionResponse {
  success: boolean;
  subscriptionId?: string;
  error?: string;
  activeSubscriptions?: WebSocketSubscription[];
}

/**
 * Authentication message
 */
export interface AuthenticationMessage {
  action: 'authenticate';
  identity: string;
  signature: string;
  timestamp: number;
  nonce?: string;
}

/**
 * Authentication response
 */
export interface AuthenticationResponse {
  success: boolean;
  connectionId?: string;
  error?: string;
  expiresAt?: number;
}

/**
 * ============================================================================
 * Monitoring & Analytics System
 * ============================================================================
 */

/**
 * System health status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'critical';

/**
 * Component health check result
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  lastCheck: number;
  responseTime?: number; // ms
  errorCount?: number;
  metadata?: Record<string, any>;
}

/**
 * System resource metrics
 */
export interface ResourceMetrics {
  cpu: {
    usage: number; // Percentage 0-100
    loadAverage: number[]; // 1min, 5min, 15min
  };
  memory: {
    used: number; // Bytes
    total: number; // Bytes
    percentage: number; // 0-100
    heapUsed: number; // Bytes
    heapTotal: number; // Bytes
  };
  uptime: number; // Seconds
  timestamp: number;
}

/**
 * Overall system health report
 */
export interface HealthReport {
  status: HealthStatus;
  timestamp: number;
  uptime: number;
  version: string;
  components: ComponentHealth[];
  resources: ResourceMetrics;
  metrics: {
    totalIntents: number;
    totalSettlements: number;
    activeConnections: number;
    queueDepth: number;
    errorRate: number; // Errors per minute
  };
}

/**
 * Performance metrics snapshot
 */
export interface PerformanceSnapshot {
  timestamp: number;
  interval: number; // Measurement interval in ms

  // Event metrics
  events: {
    total: number;
    rate: number; // Events per second
    byType: Record<string, number>;
    published: number;
    filtered: number;
    queueSize: number;
  };

  // WebSocket metrics
  websocket: {
    connections: number;
    authenticated: number;
    messagesIn: number;
    messagesOut: number;
    messageRate: number; // Messages per second
    bytesIn: number;
    bytesOut: number;
    bandwidth: number; // Bytes per second
    subscriptions: number;
  };

  // Operation metrics
  operations: {
    intentsIngested: number;
    settlementsProposed: number;
    challengesSubmitted: number;
    burnsExecuted: number;
    receiptsGenerated: number;
    disputesInitiated: number;
  };

  // Latency metrics (in milliseconds)
  latency: {
    eventPublish: {
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
    llmRequests: {
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
  };

  // Error metrics
  errors: {
    total: number;
    rate: number; // Errors per minute
    byType: Record<string, number>;
  };
}

/**
 * Performance analytics summary over time
 */
export interface PerformanceAnalytics {
  period: {
    start: number;
    end: number;
    duration: number; // ms
  };

  // Aggregate statistics
  summary: {
    totalEvents: number;
    totalMessages: number;
    totalErrors: number;
    averageEventRate: number; // Events/sec
    averageMessageRate: number; // Messages/sec
    averageErrorRate: number; // Errors/min
    peakEventRate: number;
    peakMessageRate: number;
    uptimePercentage: number;
  };

  // Historical snapshots
  snapshots: PerformanceSnapshot[];

  // Trends
  trends: {
    eventRate: 'increasing' | 'stable' | 'decreasing';
    connectionCount: 'increasing' | 'stable' | 'decreasing';
    errorRate: 'increasing' | 'stable' | 'decreasing';
  };

  // Alerts/warnings
  alerts: PerformanceAlert[];
}

/**
 * Performance alert/warning
 */
export interface PerformanceAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: 'high_latency' | 'high_error_rate' | 'high_memory' | 'high_queue_depth' | 'connection_limit' | 'other';
  message: string;
  timestamp: number;
  value?: number;
  threshold?: number;
  metadata?: Record<string, any>;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  enabled: boolean;
  healthCheckInterval: number; // ms
  metricsInterval: number; // ms
  snapshotRetention: number; // Number of snapshots to keep
  alertThresholds: {
    highLatency: number; // ms
    highErrorRate: number; // Errors per minute
    highMemory: number; // Percentage
    highQueueDepth: number; // Number of items
    connectionLimit: number; // Percentage of max
  };
}

/**
 * Real-time metrics event payload
 */
export interface MetricsEventPayload {
  snapshot: PerformanceSnapshot;
  health: HealthReport;
}

// ============================================================================
// DPoS Validator Rotation Types
// ============================================================================

/**
 * Validator information for rotation purposes
 */
export interface ValidatorInfo {
  mediatorId: string;
  effectiveStake: number;
  isActive: boolean;
  slotIndex: number; // -1 if not in active set
  lastActiveAt: number;
  joinedAt: number;
  missedSlots: number; // Count of missed slots for jailing
}

/**
 * Epoch represents a rotation period
 */
export interface Epoch {
  epochNumber: number;
  startTime: number;
  endTime: number;
  activeValidators: string[]; // Ordered list of mediator IDs
  slotDurationMs: number;
  totalSlots: number;
}

/**
 * Slot assignment for a specific time
 */
export interface SlotAssignment {
  epochNumber: number;
  slotIndex: number;
  validatorId: string;
  startTime: number;
  endTime: number;
  isCurrentSlot: boolean;
}

/**
 * Rotation event for tracking changes
 */
export interface RotationEvent {
  eventId: string;
  eventType: 'epoch_start' | 'validator_joined' | 'validator_left' | 'validator_jailed' | 'stake_changed';
  timestamp: number;
  epochNumber: number;
  affectedValidators: string[];
  details: Record<string, any>;
}

/**
 * Configuration for validator rotation
 */
export interface RotationConfig {
  activeSlots: number; // Number of active validator slots (default: 21)
  rotationPeriodHours: number; // Epoch duration in hours (default: 24)
  slotDurationMinutes: number; // How long each validator's slot lasts (default: 10)
  minStakeForRotation: number; // Minimum stake to be considered (default: 1000)
  jailThreshold: number; // Missed slots before jailing (default: 3)
  unjailCooldownHours: number; // Hours before unjailing allowed (default: 24)
}

/**
 * Rotation status summary
 */
export interface RotationStatus {
  currentEpoch: Epoch | null;
  currentSlot: SlotAssignment | null;
  isCurrentValidator: boolean;
  nextSlot: SlotAssignment | null;
  validatorCount: number;
  activeValidatorCount: number;
  jailedCount: number;
  config: RotationConfig;
}