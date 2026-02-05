/**
 * Core types for NatLangChain Mediator Node
 *
 * This module defines the core type system for the NatLangChain protocol,
 * implementing the semantic governance framework defined in NCIP-000 through NCIP-015.
 *
 * @see NCIP-001 for the Canonical Term Registry
 * @see NCIP-000 for Terminology & Semantics Governance
 */

/**
 * Consensus mode determines how settlements are validated and finalized.
 *
 * - `permissionless`: Pure Proof-of-Alignment + Reputation-based consensus.
 *   Any mediator meeting minimum reputation can propose settlements.
 *   Weight is calculated per NCIP-010 formula.
 *
 * - `dpos`: Delegated Proof-of-Stake with validator rotation.
 *   Active validators are selected based on effective stake (own + delegated).
 *   Rotation occurs per epoch as defined in the rotation config.
 *
 * - `poa`: Proof-of-Authority for permissioned environments.
 *   Only pre-authorized mediators may submit proposals.
 *   Requires authority signature for settlement submission.
 *
 * - `hybrid`: Configurable combination of DPoS and PoA.
 *   Supports gradual transitions between consensus modes.
 *
 * @see NCIP-007 for Validator Trust Scoring & Reliability Weighting
 * @see NCIP-010 for Mediator Reputation, Slashing & Market Dynamics
 */
export type ConsensusMode = 'permissionless' | 'dpos' | 'poa' | 'hybrid';

/**
 * Intent status tracks the lifecycle of a user's intent on-chain.
 *
 * An Intent is a human-authored expression of desired outcome or commitment,
 * recorded as prose and treated as the primary semantic input to the protocol.
 *
 * - `pending`: Intent submitted, awaiting alignment with counterparty intent.
 * - `accepted`: Intent has been matched and settlement proposed.
 * - `rejected`: Intent was explicitly rejected by the author or counterparty.
 * - `closed`: Intent has been successfully settled and finalized.
 * - `unalignable`: Intent flagged as impossible to align (e.g., spam, incoherent).
 *
 * @see NCIP-001 for the canonical definition of "Intent"
 * @see NCIP-002 for Semantic Drift Thresholds affecting intent interpretation
 */
export type IntentStatus = 'pending' | 'accepted' | 'rejected' | 'closed' | 'unalignable';

/**
 * Settlement status tracks the lifecycle of a proposed settlement.
 *
 * A Settlement is the resolution of an Agreement or Dispute resulting in
 * final obligations, compensation, or closure (NCIP-001).
 *
 * - `proposed`: Settlement submitted by mediator, awaiting party acceptance.
 * - `accepted`: Both parties have accepted the proposed terms.
 * - `rejected`: One or both parties rejected the settlement.
 * - `closed`: Settlement finalized and executed on-chain.
 * - `challenged`: Settlement is under challenge review per MP-03.
 *
 * @see NCIP-001 for the canonical definition of "Settlement"
 * @see NCIP-005 for Dispute Escalation & Semantic Locking
 * @see NCIP-012 for Human Ratification UX requirements
 */
export type SettlementStatus = 'proposed' | 'accepted' | 'rejected' | 'closed' | 'challenged';

/**
 * Represents a user's intent on the chain.
 *
 * An Intent is a human-authored expression of desired outcome or commitment,
 * recorded as prose and treated as the primary semantic input to the
 * NatLangChain protocol (NCIP-001). Intents are not executable by themselves;
 * execution is always derived through the alignment and settlement process.
 *
 * Intents form the canonical audit trail and are subject to:
 * - Semantic drift detection per NCIP-002
 * - Temporal fixity binding per NCIP-001
 * - Proof of Understanding validation per NCIP-004
 *
 * @see NCIP-001 for the canonical definition of "Intent"
 * @see NCIP-002 for Semantic Drift Thresholds
 * @see NCIP-004 for Proof of Understanding requirements
 */
export interface Intent {
  /** Unique cryptographic hash identifying this intent on-chain */
  hash: string;

  /** Public key or identifier of the human author */
  author: string;

  /**
   * Natural language prose describing the intent.
   * This is the primary semantic content subject to drift analysis.
   * @see NCIP-002 for how prose is evaluated for semantic drift
   */
  prose: string;

  /**
   * Explicit list of desired outcomes.
   * Desires are positive goals the author wants to achieve.
   */
  desires: string[];

  /**
   * Explicit list of constraints or limitations.
   * Constraints are boundaries that must not be violated in any settlement.
   * Violation of constraints triggers challenge eligibility per MP-03.
   */
  constraints: string[];

  /**
   * Optional facilitation fee offered for mediator alignment.
   * Subject to burn economics per MP-06 Observance-Burn.
   */
  offeredFee?: number;

  /** Unix timestamp when intent was submitted on-chain */
  timestamp: number;

  /** Current lifecycle status of the intent */
  status: IntentStatus;

  /**
   * Optional semantic branch categorization.
   * Example: "Professional/Engineering", "Personal/Services"
   */
  branch?: string;

  /**
   * Count of flags for unalignable tracking.
   * Used in sybil resistance and spam detection.
   */
  flagCount?: number;
}

/**
 * Proposed Settlement structure.
 *
 * A ProposedSettlement represents a mediator's proposal for resolving
 * aligned intents between two parties. The settlement includes:
 * - Reasoning trace for transparency and auditability
 * - Proposed terms derived from intent analysis
 * - Facilitation fee structure per MP-01
 * - Consensus-mode-specific fields (DPoS stake, PoA signature)
 *
 * Settlements are subject to:
 * - Human ratification requirements per NCIP-012
 * - Challenge windows per MP-03
 * - Semantic consensus verification for high-value settlements
 * - Cooling periods before finalization
 *
 * @see NCIP-001 for the canonical definition of "Settlement"
 * @see NCIP-010 for Mediator Reputation & Slashing
 * @see NCIP-012 for Human Ratification UX constraints
 * @see MP-01 for Negotiation & Ratification protocol
 */
export interface ProposedSettlement {
  /** Unique identifier for this settlement proposal */
  id: string;

  /** Hash of the first party's intent */
  intentHashA: string;

  /** Hash of the second party's intent */
  intentHashB: string;

  /**
   * LLM-generated reasoning trace explaining the settlement.
   * Provides transparency into how terms were derived from intents.
   * Subject to semantic drift analysis per NCIP-002.
   */
  reasoningTrace: string;

  /**
   * Proposed settlement terms derived from intent alignment.
   * Subject to cognitive load limits per NCIP-012:
   * - Simple agreements: max 7 semantic units
   * - Financial settlements: max 9 semantic units
   */
  proposedTerms: {
    /** Agreed price or compensation */
    price?: number;
    /** List of deliverables to be provided */
    deliverables?: string[];
    /** Timeline description for delivery */
    timelines?: string;
    /** Reference to escrow contract if applicable */
    escrowReference?: string;
    /** Additional custom terms */
    customTerms?: Record<string, any>;
  };

  /**
   * Absolute facilitation fee amount.
   * Subject to burn economics per MP-06.
   */
  facilitationFee: number;

  /**
   * Facilitation fee as percentage of settlement value.
   * Affects mediator reputation scoring per NCIP-010.
   */
  facilitationFeePercent: number;

  /**
   * SHA-256 hash of the LLM prompt and response.
   * Enables reproducibility verification of the reasoning trace.
   */
  modelIntegrityHash: string;

  /** Identifier of the mediator who proposed this settlement */
  mediatorId: string;

  /** Unix timestamp when settlement was proposed */
  timestamp: number;

  /** Current lifecycle status of the settlement */
  status: SettlementStatus;

  /**
   * Deadline for party acceptance (Unix timestamp).
   * Default: 72 hours from proposal per protocol config.
   */
  acceptanceDeadline: number;

  // DPoS consensus fields
  /**
   * Reference to staked tokens backing this proposal.
   * Required when consensusMode is 'dpos' or 'hybrid'.
   * @see NCIP-007 for validator trust scoring
   */
  stakeReference?: string;

  /** Reference to delegations contributing to effective stake */
  delegationReference?: string;

  /**
   * Total effective stake (own + delegated).
   * Used for validator rotation and weighting.
   */
  effectiveStake?: number;

  // PoA consensus fields
  /**
   * Cryptographic signature from authorized authority.
   * Required when consensusMode is 'poa'.
   */
  authoritySignature?: string;

  // Party acceptance tracking
  /** Whether party A has accepted the settlement */
  partyAAccepted?: boolean;

  /** Whether party B has accepted the settlement */
  partyBAccepted?: boolean;

  /**
   * Challenges submitted against this settlement.
   * @see MP-03 for Dispute & Escalation Protocol
   */
  challenges?: Challenge[];

  // Semantic Consensus Verification
  /**
   * Whether this settlement requires multi-mediator verification.
   * Triggered when settlement value exceeds highValueThreshold.
   */
  requiresVerification?: boolean;

  /** Verification request sent to selected verifiers */
  verificationRequest?: VerificationRequest;

  /** Responses from verifier mediators */
  verificationResponses?: VerificationResponse[];

  /** Current status of semantic consensus verification */
  verificationStatus?: VerificationStatus;
}

/**
 * Challenge against a proposed settlement.
 *
 * A Challenge is a formally raised assertion of misinterpretation,
 * constraint violation, or semantic contradiction in a settlement.
 * Challenges are governed by MP-03 Dispute & Escalation Protocol.
 *
 * Challenge outcomes affect mediator reputation:
 * - Upheld challenges: Mediator reputation decreases
 * - Rejected challenges: Challenger's reputation may decrease
 *
 * @see NCIP-001 for the canonical definition of "Dispute" (synonym: challenge)
 * @see NCIP-005 for Dispute Escalation & Semantic Locking
 * @see NCIP-010 for reputation impact of challenge outcomes
 * @see MP-03 for Dispute & Escalation Protocol
 */
export interface Challenge {
  /** Unique identifier for this challenge */
  id: string;

  /** ID of the settlement being challenged */
  settlementId: string;

  /** Public key or identifier of the party submitting the challenge */
  challengerId: string;

  /**
   * Natural language proof of contradiction.
   * Explains how the settlement violates original intent constraints.
   * Subject to semantic drift analysis per NCIP-002.
   */
  contradictionProof: string;

  /**
   * LLM-generated paraphrase demonstrating the violation.
   * Provides independent evidence supporting the contradiction claim.
   */
  paraphraseEvidence: string;

  /** Unix timestamp when challenge was submitted */
  timestamp: number;

  /**
   * Current status of the challenge.
   * - `pending`: Challenge under validator review
   * - `upheld`: Challenge validated, settlement invalidated
   * - `rejected`: Challenge dismissed, settlement stands
   */
  status: 'pending' | 'upheld' | 'rejected';

  /**
   * List of validator IDs reviewing this challenge.
   * Validator trust scores affect challenge outcome weighting.
   * @see NCIP-007 for Validator Trust Scoring
   */
  validators?: string[];
}

/**
 * Mediator reputation counters.
 *
 * Tracks the on-chain behavior that determines mediator trustworthiness.
 * Mediators earn influence only by being repeatedly correct, aligned, and non-coercive.
 *
 * Reputation Weight Formula (MP-01):
 * ```
 * Weight = (Successful_Closures + Failed_Challenges × 2) /
 *          (1 + Upheld_Challenges_Against + Forfeited_Fees)
 * ```
 *
 * Reputation affects:
 * - Proposal visibility and ranking
 * - Validator weighting during consensus
 * - Market selection probability
 * - Eligibility for high-value settlements
 *
 * Mediators can NEVER:
 * - Have authority to finalize agreements
 * - Override parties or validators
 * - Transfer or inject off-chain reputation
 *
 * @see NCIP-010 for Mediator Reputation, Slashing & Market Dynamics
 * @see NCIP-007 for Validator Trust Scoring integration
 * @see MP-01 for Negotiation & Ratification protocol
 */
export interface MediatorReputation {
  /** Unique identifier of the mediator */
  mediatorId: string;

  /**
   * Count of settlements successfully closed.
   * Increases weight numerator.
   */
  successfulClosures: number;

  /**
   * Challenges submitted by this mediator that were rejected.
   * Counter-intuitively positive: shows mediator can identify issues
   * even when not upheld (weighted × 2 in formula).
   */
  failedChallenges: number;

  /**
   * Challenges against this mediator's settlements that were upheld.
   * Increases weight denominator, reducing overall score.
   * Triggers slashing per NCIP-010 slashable offenses.
   */
  upheldChallengesAgainst: number;

  /**
   * Count of facilitation fees forfeited due to settlement rejection.
   * Increases weight denominator, reducing overall score.
   */
  forfeitedFees: number;

  /**
   * Calculated reputation weight using MP-01 formula.
   * Affects proposal ranking and validator attention.
   * Maximum effective weight capped at 0.35 per NCIP-007.
   */
  weight: number;

  /** Unix timestamp of last reputation update */
  lastUpdated: number;
}

/**
 * Stake information for DPoS consensus mode.
 *
 * In DPoS mode, mediators must post a reputation bond (stake) to participate.
 * Effective stake determines validator rotation priority and proposal weighting.
 *
 * Unbonded mediators MAY observe but MAY NOT submit proposals.
 *
 * @see NCIP-007 for how stake affects validator trust weighting
 * @see NCIP-010 for stake slashing conditions
 */
export interface Stake {
  /** Mediator ID this stake belongs to */
  mediatorId: string;

  /** Direct stake amount posted by the mediator (in NLC tokens) */
  amount: number;

  /** Total stake delegated to this mediator by others */
  delegatedAmount: number;

  /**
   * Effective stake = own stake + delegated stake.
   * Determines rotation priority in DPoS validator selection.
   */
  effectiveStake: number;

  /** List of delegations contributing to delegatedAmount */
  delegators: Delegation[];

  /**
   * Unbonding period in milliseconds.
   * Stake cannot be withdrawn until this period elapses after unbonding request.
   */
  unbondingPeriod: number;

  /**
   * Current stake status.
   * - `bonded`: Active stake, can participate in consensus
   * - `unbonding`: Withdrawal requested, in cooldown period
   * - `unbonded`: Stake released, no longer participating
   */
  status: 'bonded' | 'unbonding' | 'unbonded';
}

/**
 * Delegation information for DPoS consensus.
 *
 * Token holders can delegate stake to mediators they trust,
 * increasing the mediator's effective stake and earning delegation rewards.
 *
 * Delegation does NOT transfer authority—delegators only affect weight,
 * not the mediator's ability to make decisions.
 *
 * @see NCIP-007 for how delegations affect validator weighting
 * @see MP-04 for full Licensing & Delegation Protocol
 */
export interface Delegation {
  /** Public key or ID of the delegating party */
  delegatorId: string;

  /** Mediator receiving the delegation */
  mediatorId: string;

  /** Amount delegated (in NLC tokens) */
  amount: number;

  /** Unix timestamp when delegation was created */
  timestamp: number;

  /**
   * Current delegation status.
   * - `active`: Delegation in effect, contributing to effective stake
   * - `undelegating`: Withdrawal requested, in cooldown period
   * - `withdrawn`: Delegation ended, tokens returned
   */
  status: 'active' | 'undelegating' | 'withdrawn';

  /** Unix timestamp when undelegation completes (if undelegating) */
  undelegationDeadline?: number;
}

/**
 * Governance proposal for on-chain protocol changes.
 *
 * Governance proposals enable stake-weighted voting on protocol parameters,
 * authority changes, and consensus mode transitions. The governance system
 * ensures no single party can unilaterally change protocol behavior.
 *
 * Proposal lifecycle:
 * 1. Submission (requires minimum stake)
 * 2. Voting period (default: 7 days)
 * 3. Execution delay (default: 3 days after passing)
 * 4. Execution (automatic if passed and delay elapsed)
 *
 * @see NCIP-014 for Protocol Amendments & Constitutional Change
 * @see NCIP-008 for how precedent affects governance decisions
 */
export interface GovernanceProposal {
  /** Unique proposal identifier */
  id: string;

  /** Public key of the mediator submitting the proposal */
  proposerId: string;

  /** Human-readable proposal title */
  title: string;

  /** Detailed description of the proposed change */
  description: string;

  /**
   * Type of governance action being proposed.
   * - `parameter_change`: Modify protocol parameters (fees, thresholds, etc.)
   * - `authority_add`: Add new authority in PoA/hybrid mode
   * - `authority_remove`: Remove existing authority
   * - `mode_transition`: Change consensus mode (e.g., dpos → hybrid)
   */
  proposalType: 'parameter_change' | 'authority_add' | 'authority_remove' | 'mode_transition';

  /** Parameters to change if proposalType is 'parameter_change' */
  parameters?: Record<string, any>;

  /** Unix timestamp when voting period ends */
  votingPeriodEnd: number;

  /** Delay in milliseconds between passing and execution */
  executionDelay: number;

  /** Unix timestamp when proposal can be executed (after delay) */
  executionTime?: number;

  /**
   * Current proposal status.
   * - `voting`: Active voting period
   * - `passed`: Voting complete, approval threshold met
   * - `rejected`: Voting complete, approval threshold not met
   * - `executed`: Proposal changes applied
   * - `expired`: Passed but not executed within allowed window
   */
  status: 'voting' | 'passed' | 'rejected' | 'executed' | 'expired';

  /** Stake-weighted vote tallies */
  votes: {
    /** Total stake voting in favor */
    for: number;
    /** Total stake voting against */
    against: number;
    /** Total stake abstaining */
    abstain: number;
  };

  /** Minimum participation required for valid vote (percentage of total stake) */
  quorumRequired: number;

  /** Unix timestamp when proposal was submitted */
  timestamp: number;

  /** Optional prose description for chain submission */
  prose?: string;
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
 * Burn transaction types per MP-06 Observance-Burn protocol.
 *
 * Burns create economic pressure that:
 * - Discourages spam and low-effort intents
 * - Scales costs with system load
 * - Rewards successful settlements with lower net cost
 *
 * - `base_filing`: Standard burn for intent submission
 * - `escalated`: Increased burn for high-frequency submitters (exponential)
 * - `success`: Partial burn rebate on successful settlement
 * - `load_scaled`: Dynamic burn based on current system load
 *
 * @see MP-06 for Behavioral Pressure & Anti-Entropy Controls
 */
export type BurnType = 'base_filing' | 'escalated' | 'success' | 'load_scaled';

/**
 * Burn transaction record.
 *
 * Records every token burn event for transparency and analytics.
 * Burns flow to the treasury and fund:
 * - Defensive dispute subsidies
 * - Escalation bounty pools
 * - Harassment-mitigation reserves
 *
 * This creates a closed accountability loop:
 * "Bad mediation funds protection against bad mediation." (NCIP-010)
 *
 * @see MP-06 for Behavioral Pressure & Anti-Entropy Controls
 * @see NCIP-010 for how burns interact with mediator reputation
 */
export interface BurnTransaction {
  /** Unique burn transaction identifier */
  id: string;

  /** Type of burn event */
  type: BurnType;

  /** Public key or ID of the party whose action triggered the burn */
  author: string;

  /** Amount of NLC tokens burned */
  amount: number;

  /** Hash of associated intent (for base_filing, escalated burns) */
  intentHash?: string;

  /** ID of associated settlement (for success burns) */
  settlementId?: string;

  /**
   * Multiplier applied to base burn amount.
   * For escalated: 2^(submission_count - free_allowance)
   * For load_scaled: based on current system load factor
   */
  multiplier?: number;

  /** Unix timestamp of burn execution */
  timestamp: number;

  /** On-chain transaction hash for verification */
  transactionHash?: string;
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
  verifierSelectionTimeoutMs?: number; // Timeout for selecting verifiers (default: 10000)
  chainRequestTimeoutMs?: number; // Timeout for chain API requests (default: 10000)

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
  webSocketAllowedOrigins?: string[]; // Allowed CORS origins (default: ['*'] - configure for production!)

  // Core timing intervals (alignment cycle)
  alignmentCycleIntervalMs?: number; // Alignment cycle interval in ms (default: 30000)
  intentPollingIntervalMs?: number; // Intent polling interval in ms (default: 10000)
  settlementMonitoringIntervalMs?: number; // Settlement monitoring interval in ms (default: 60000)

  // Embedding configuration
  embeddingProvider?: 'openai' | 'voyage' | 'cohere' | 'fallback'; // Embedding provider for Anthropic users (default: 'fallback' - WARNING: development only)
  embeddingApiKey?: string; // API key for external embedding provider (if different from LLM key)
  embeddingModel?: string; // Model name for embedding provider

  // Negotiation thresholds
  minNegotiationConfidence?: number; // Minimum LLM confidence score for successful negotiation 0-100 (default: 60)

  // Intent validation thresholds
  maxIntentFlags?: number; // Maximum flags before intent is marked unalignable (default: 5)
  minIntentProseLength?: number; // Minimum prose length for valid intent in characters (default: 50)

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

  // NCIP Hover Tips configuration
  enableNCIPHoverTips?: boolean; // Enable NCIP hover tips (default: true)
  ncipHoverTipsShortOnly?: boolean; // Show short descriptions only (default: false)
  ncipHoverTipsShowReferences?: boolean; // Show NCIP document references (default: true)
  ncipHoverTipsShowRelated?: boolean; // Show related concepts (default: true)
  ncipHoverTipsDelayMs?: number; // Delay before showing tooltip in ms (default: 300)

  // Security Apps Integration configuration
  // @see https://github.com/kase1111-hash/Boundary-SIEM
  // @see https://github.com/kase1111-hash/boundary-daemon-
  enableSecurityApps?: boolean; // Enable Boundary SIEM and Daemon integration (default: false)
  boundaryDaemonUrl?: string; // Boundary Daemon API URL (default: 'http://localhost:9000')
  boundaryDaemonToken?: string; // Authentication token for Boundary Daemon
  boundaryDaemonFailOpen?: boolean; // Allow operations if daemon unavailable (default: false)
  boundarySIEMUrl?: string; // Boundary SIEM API URL (default: 'http://localhost:8080')
  boundarySIEMToken?: string; // Authentication token for Boundary SIEM
  securityEventBatchSize?: number; // SIEM event batch size (default: 100)
  securityEventFlushInterval?: number; // SIEM batch flush interval in ms (default: 5000)
  protectWebSocketConnections?: boolean; // Use Boundary Daemon for WebSocket auth (default: true)
  protectChainConnections?: boolean; // Use Boundary Daemon for chain connection auth (default: true)

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
  /** Error message if negotiation failed due to an error (not just no alignment) */
  error?: string;
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

// ============================================================================
// Semantic Consensus Verification Types
//
// Multi-mediator verification ensures high-value settlements have been
// independently validated by multiple parties. Verifiers produce semantic
// summaries that are compared for equivalence using embedding similarity.
//
// This implements the multi-model consensus requirement from NCIP-007,
// preventing single-validator capture and ensuring reliability.
//
// @see NCIP-007 for Validator Trust Scoring & Reliability Weighting
// @see NCIP-002 for Semantic Drift Thresholds
// ============================================================================

/**
 * Status of semantic consensus verification.
 *
 * - `pending`: Waiting for verification responses
 * - `in_progress`: Verifiers selected, awaiting responses
 * - `consensus_reached`: 3+ semantically equivalent summaries received
 * - `consensus_failed`: Failed to reach consensus threshold
 * - `timeout`: Verification deadline passed without consensus
 * - `not_required`: Settlement value below verification threshold
 *
 * @see NCIP-007 for multi-validator consensus requirements
 */
export type VerificationStatus =
  | 'pending'           // Waiting for verification responses
  | 'in_progress'       // Verifiers selected, awaiting responses
  | 'consensus_reached' // 3+ semantically equivalent summaries
  | 'consensus_failed'  // Failed to reach consensus
  | 'timeout'           // Verification deadline passed
  | 'not_required'      // Settlement below threshold
  | 'skipped';          // Verification required but initiation failed

/**
 * Request for semantic verification from selected mediators.
 *
 * When a settlement exceeds the highValueThreshold, verification requests
 * are sent to randomly selected mediators (weighted by trust score).
 * Verifiers independently summarize the settlement semantics.
 *
 * @see NCIP-007 for verifier selection weighting
 */
export interface VerificationRequest {
  /** ID of the settlement requiring verification */
  settlementId: string;

  /** Mediator ID requesting verification */
  requesterId: string;

  /** Hash of intent A in the settlement */
  intentHashA: string;

  /** Hash of intent B in the settlement */
  intentHashB: string;

  /** Proposed terms to be verified */
  proposedTerms: ProposedSettlement['proposedTerms'];

  /** Settlement value (determines if verification is required) */
  settlementValue: number;

  /** 5 mediator IDs selected via weighted random (by trust score) */
  selectedVerifiers: string[];

  /** Unix timestamp when verification was requested */
  requestedAt: number;

  /** Unix timestamp deadline for responses */
  responseDeadline: number;

  /** Cryptographic signature of the request */
  signature: string;
}

/**
 * Response from a verifier mediator.
 *
 * Each verifier independently produces a semantic summary of the settlement,
 * which is converted to an embedding vector for similarity comparison.
 * Summaries are compared for semantic equivalence, not textual equality.
 *
 * @see NCIP-002 for semantic comparison thresholds
 * @see NCIP-007 for verifier trust weighting
 */
export interface VerificationResponse {
  /** ID of the settlement being verified */
  settlementId: string;

  /** ID of the verifier mediator */
  verifierId: string;

  /** Natural language summary of settlement semantics */
  semanticSummary: string;

  /** Embedding vector for similarity comparison */
  summaryEmbedding: number[];

  /** Whether verifier approves the settlement */
  approves: boolean;

  /** Verifier's confidence in their summary (0-1) */
  confidence: number;

  /** Unix timestamp of response */
  timestamp: number;

  /** Cryptographic signature of the response */
  signature: string;
}

/**
 * Result of semantic equivalence check between two summaries.
 *
 * Equivalence is determined by cosine similarity of embedding vectors,
 * not textual comparison. This allows for different wording while
 * ensuring semantic agreement.
 *
 * @see NCIP-002 for semantic similarity thresholds (default: 0.85)
 */
export interface SemanticEquivalenceResult {
  /** First summary being compared */
  summary1: string;

  /** Second summary being compared */
  summary2: string;

  /** Cosine similarity of embedding vectors (0-1) */
  cosineSimilarity: number;

  /** Whether summaries are semantically equivalent */
  areEquivalent: boolean;

  /** Similarity threshold used for comparison (default: 0.85) */
  threshold: number;
}

/**
 * Complete verification record for a settlement.
 *
 * Aggregates all verification requests, responses, and equivalence checks
 * for a single settlement. Consensus requires 3+ semantically equivalent
 * summaries from independent verifiers.
 *
 * @see NCIP-007 for consensus requirements
 */
export interface SemanticVerification {
  /** ID of the settlement being verified */
  settlementId: string;

  /** Current verification status */
  status: VerificationStatus;

  /** Original verification request */
  request: VerificationRequest;

  /** Responses from verifier mediators */
  responses: VerificationResponse[];

  /** Pairwise equivalence comparisons between summaries */
  equivalenceResults: SemanticEquivalenceResult[];

  /** Whether consensus was reached */
  consensusReached: boolean;

  /** Number of semantically equivalent summaries found */
  consensusCount: number;

  /** Required number for consensus (default: 3) */
  requiredConsensus: number;

  /** Unix timestamp when verification completed */
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
//
// The Proof-of-Effort system provides cryptographic attestation that work
// actually occurred, enabling fair attribution and preventing claims of
// effort without evidence. Receipts form the foundation for MP-05 settlements.
//
// @see MP-02-spec.md for full protocol specification
// @see NCIP-004 for Proof of Understanding integration
// ============================================================================

/**
 * Signal modality types for effort capture.
 *
 * Different modalities represent different forms of observable work:
 * - `text_edit`: Text editing activity (files, documents)
 * - `command`: Shell/CLI commands executed
 * - `voice`: Voice input or transcriptions
 * - `structured_tool`: Tool invocations with structured output
 * - `other`: Custom or undefined modality
 *
 * @see MP-02 for signal capture requirements
 */
export type SignalModality = 'text_edit' | 'command' | 'voice' | 'structured_tool' | 'other';

/**
 * Raw observable trace of effort.
 *
 * A Signal is the atomic unit of observable work in the Proof-of-Effort system.
 * Signals are captured by observers, hashed for integrity, and grouped into
 * EffortSegments for LLM validation.
 *
 * Signals are encrypted at rest when effortEncryptSignals is enabled.
 *
 * @see MP-02 for signal capture and privacy requirements
 */
export interface Signal {
  /** Unique identifier for this signal */
  signalId: string;

  /** Type of work this signal represents */
  modality: SignalModality;

  /** Unix timestamp when signal was captured */
  timestamp: number;

  /** Raw signal content (encrypted at rest if configured) */
  content: string;

  /** Additional context (file path, working directory, etc.) */
  metadata?: Record<string, any>;

  /** SHA-256 hash of content for integrity verification */
  hash: string;
}

/**
 * Effort segment status in the validation pipeline.
 *
 * - `active`: Segment is still receiving signals
 * - `complete`: Segment boundary reached, ready for validation
 * - `validated`: LLM has assessed the segment
 * - `anchored`: Receipt has been recorded on-chain
 *
 * @see MP-02 for segment lifecycle
 */
export type SegmentStatus = 'active' | 'complete' | 'validated' | 'anchored';

/**
 * Bounded time slice of signals treated as unit of analysis.
 *
 * Segments group related signals for LLM validation. Segmentation can be:
 * - Time-based (fixed window duration)
 * - Activity-based (gaps in activity trigger boundaries)
 * - Hybrid (combination of both)
 * - Human-marked (explicit boundaries from the user)
 *
 * @see MP-02 for segmentation strategies
 */
export interface EffortSegment {
  /** Unique segment identifier */
  segmentId: string;

  /** Unix timestamp when segment began */
  startTime: number;

  /** Unix timestamp when segment ended */
  endTime: number;

  /** Signals contained in this segment */
  signals: Signal[];

  /** Current segment status */
  status: SegmentStatus;

  /** Optional human-provided marker or description */
  humanMarker?: string;

  /**
   * How this segment was created.
   * Values: 'time_window', 'activity_boundary', 'human_marker'
   */
  segmentationRule: string;
}

/**
 * Validation assessment from LLM for an effort segment.
 *
 * The LLM evaluates segments across multiple dimensions to determine
 * whether the work is coherent, progressive, and original. This prevents
 * fraudulent effort claims while respecting human work patterns.
 *
 * @see MP-02 for validation criteria and thresholds
 * @see NCIP-007 for validator trust scoring
 */
export interface ValidationAssessment {
  /** LLM model identifier that performed validation */
  validatorId: string;

  /** Specific model version for reproducibility */
  modelVersion: string;

  /** Unix timestamp of validation */
  timestamp: number;

  /** Linguistic coherence score (0-1): Is the work linguistically consistent? */
  coherenceScore: number;

  /** Conceptual progression score (0-1): Does the work show logical progression? */
  progressionScore: number;

  /** Internal consistency score (0-1): Are there contradictions? */
  consistencyScore: number;

  /** Synthesis score (0-1): 0=duplicated, 1=original synthesis */
  synthesisScore: number;

  /** Deterministic summary of the effort for receipt */
  summary: string;

  /** Areas where LLM expressed uncertainty */
  uncertaintyFlags: string[];

  /** Supporting evidence for the scores */
  evidence: string;
}

/**
 * Receipt status in the anchoring pipeline.
 *
 * - `draft`: Receipt created but not yet validated
 * - `validated`: LLM assessment complete
 * - `anchored`: Recorded on-chain/ledger
 * - `verified`: Independent verification complete
 *
 * @see MP-02 for receipt lifecycle
 */
export type ReceiptStatus = 'draft' | 'validated' | 'anchored' | 'verified';

/**
 * Cryptographic record attesting effort occurred.
 *
 * An EffortReceipt is the immutable proof that work was performed,
 * validated by an LLM, and anchored to a ledger. Receipts are referenced
 * in MP-05 settlements as evidence of contribution.
 *
 * Receipts can chain together via priorReceipts for continuous work sessions.
 *
 * @see MP-02 for receipt generation and verification
 * @see MP-05 for how receipts inform settlements
 */
export interface EffortReceipt {
  /** Unique receipt identifier (UUID + hash) */
  receiptId: string;

  /** ID of the segment this receipt attests */
  segmentId: string;

  /** Unix timestamp when effort began */
  startTime: number;

  /** Unix timestamp when effort ended */
  endTime: number;

  /** SHA-256 hashes of all signals in the segment */
  signalHashes: string[];

  /** LLM validation assessment */
  validation: ValidationAssessment;

  /** System/component that captured the signals */
  observerId: string;

  /** LLM model that validated the effort */
  validatorId: string;

  /** SHA-256 hash of receipt contents for integrity */
  receiptHash: string;

  /** Current receipt status */
  status: ReceiptStatus;

  /** Unix timestamp when anchored to ledger */
  anchoredAt?: number;

  /** On-chain transaction or ledger reference */
  ledgerReference?: string;

  /** References to previous receipts in the chain */
  priorReceipts?: string[];

  /** References to external work products (PRs, documents, etc.) */
  externalArtifacts?: string[];

  /** Additional metadata */
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
//
// MP-03 provides structured dispute resolution that preserves human authority
// while enabling AI-assisted clarification. Disputes can escalate to external
// authorities (arbitrators, DAOs, courts) with complete evidence packages.
//
// Key constraints:
// - Escalation MUST be human-authored (per NCIP-012)
// - Evidence is frozen when dispute is declared
// - Cooling periods apply per NCIP-012 (6 hours for dispute escalation)
//
// @see MP-03-spec.md for full protocol specification
// @see NCIP-005 for Dispute Escalation & Semantic Locking
// @see NCIP-012 for Human Ratification UX constraints
// ============================================================================

/**
 * Dispute status tracks the lifecycle of a formal dispute.
 *
 * - `initiated`: Dispute declared by claimant
 * - `under_review`: Evidence being reviewed by validators
 * - `clarifying`: Optional mediator-assisted clarification phase
 * - `escalated`: Escalated to external authority
 * - `resolved`: Resolution recorded and finalized
 * - `dismissed`: Dispute dismissed without resolution
 *
 * @see NCIP-005 for status transitions and semantic locking
 */
export type DisputeStatus = 'initiated' | 'under_review' | 'clarifying' | 'escalated' | 'resolved' | 'dismissed';

/**
 * Role of a party in a dispute.
 *
 * - `claimant`: Party initiating the dispute
 * - `respondent`: Party being accused or challenged
 *
 * @see MP-03 for party rights and responsibilities
 */
export type DisputePartyRole = 'claimant' | 'respondent';

/**
 * Party information in a dispute.
 *
 * @see MP-03 for party identification requirements
 */
export interface DisputeParty {
  /** Public key or unique identifier of the party */
  partyId: string;

  /** Role in this dispute */
  role: DisputePartyRole;

  /** Optional human-readable name */
  name?: string;

  /** Optional contact information for external resolution */
  contactInfo?: string;
}

/**
 * Reference to an item being contested in a dispute.
 *
 * Contested items are automatically frozen (marked UNDER_DISPUTE)
 * when autoFreezeEvidence is enabled.
 *
 * @see MP-03 for evidence freezing rules
 * @see NCIP-005 for Semantic Locking
 */
export interface ContestedItem {
  /** Type of the contested artifact */
  itemType: 'intent' | 'settlement' | 'receipt' | 'agreement' | 'delegation';

  /** Hash or unique ID of the contested item */
  itemId: string;

  /** Optional hash for content verification */
  itemHash?: string;
}

/**
 * Evidence submitted in support of a dispute claim.
 *
 * Evidence is immutable once submitted and can be linked to
 * other items for context.
 *
 * @see MP-03 for evidence submission rules
 */
export interface DisputeEvidence {
  /** Unique evidence identifier */
  evidenceId: string;

  /** ID of the dispute this evidence supports */
  disputeId: string;

  /** Party who submitted this evidence */
  submittedBy: string;

  /** Unix timestamp of submission */
  timestamp: number;

  /** Type of evidence being submitted */
  evidenceType: 'document' | 'statement' | 'witness' | 'artifact' | 'other';

  /** Natural language description of the evidence */
  description: string;

  /** SHA-256 hash of evidence content for integrity */
  contentHash?: string;

  /** References to related items */
  linkedItems?: string[];

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Formal dispute declaration.
 *
 * A DisputeDeclaration initiates the MP-03 dispute resolution process.
 * Once declared, contested items are frozen and parties enter the
 * structured resolution workflow.
 *
 * @see MP-03 for dispute lifecycle
 * @see NCIP-005 for Semantic Locking upon dispute
 * @see NCIP-012 for human ratification requirements
 */
export interface DisputeDeclaration {
  /** Unique dispute identifier */
  disputeId: string;

  /** Party initiating the dispute */
  claimant: DisputeParty;

  /** Party being challenged (may be unknown at declaration) */
  respondent?: DisputeParty;

  /** Items being contested in this dispute */
  contestedItems: ContestedItem[];

  /** Natural language description of the dispute */
  issueDescription: string;

  /** Preferred escalation path (e.g., "arbitration", "DAO", "court") */
  desiredEscalationPath?: string;

  /** Current dispute status */
  status: DisputeStatus;

  /** Unix timestamp when dispute was initiated */
  initiatedAt: number;

  /** Unix timestamp of last status update */
  updatedAt: number;

  /** Evidence submitted by both parties */
  evidence: DisputeEvidence[];

  /** Optional AI-assisted clarification record */
  clarificationRecord?: ClarificationRecord;

  /** Escalation declaration if dispute was escalated */
  escalation?: EscalationDeclaration;

  /** Resolution if dispute has been resolved */
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
//
// MP-04 provides structured licensing and delegation of authority while
// maintaining human sovereignty. Licenses grant usage rights over artifacts,
// while delegations grant decision-making authority to agents or other humans.
//
// Key constraints:
// - Ratification MUST be human-authored (NCIP-012)
// - Maximum redelegation depth prevents authority dilution
// - Violations are tracked and can trigger MP-03 disputes
// - 24-hour cooling period for license delegation (NCIP-012)
//
// @see MP-04-spec.md for full protocol specification
// @see NCIP-012 for Human Ratification UX requirements
// ============================================================================

/**
 * License status in the ratification pipeline.
 *
 * - `proposed`: License terms proposed, awaiting grantor ratification
 * - `ratified`: Grantor has explicitly consented to terms
 * - `active`: License is in effect
 * - `expired`: Time-bounded license has expired
 * - `revoked`: License explicitly revoked by grantor
 *
 * @see MP-04 for status transitions
 * @see NCIP-012 for ratification requirements
 */
export type LicenseStatus = 'proposed' | 'ratified' | 'active' | 'expired' | 'revoked';

/**
 * Type of subject being licensed.
 *
 * @see MP-04 for licensing different artifact types
 */
export type SubjectType = 'receipt' | 'artifact' | 'agreement' | 'settlement' | 'intent' | 'other';

/**
 * Scope definition for a license grant.
 *
 * Defines what can be done with the licensed subject, including
 * purpose restrictions, prohibited actions, duration, and transferability.
 *
 * @see MP-04 for scope definition requirements
 */
export interface LicenseScope {
  /** Subject of the license (what is being licensed) */
  subject: {
    /** Type of artifact being licensed */
    type: SubjectType;
    /** IDs of specific items (receipts, artifacts, agreements, etc.) */
    ids: string[];
  };

  /** Allowed use cases in natural language */
  purpose: string;

  /** Prohibited actions in natural language */
  limits: string[];

  /** Duration constraints */
  duration: {
    /** Whether license is perpetual or time-limited */
    type: 'perpetual' | 'time_bounded';
    /** Expiration timestamp for time_bounded licenses */
    expiresAt?: number;
  };

  /** Transfer and sublicense permissions */
  transferability: {
    /** Whether grantee can sublicense to others */
    sublicenseAllowed: boolean;
    /** Whether grantee can redelegate rights */
    redelegationAllowed: boolean;
  };
}

/**
 * License grant conferring usage rights.
 *
 * A License grants specific rights over artifacts (receipts, agreements, etc.)
 * from a grantor to a grantee. Licenses require human ratification per NCIP-012.
 *
 * @see MP-04 for license lifecycle
 * @see NCIP-012 for ratification requirements (24h cooling period)
 */
export interface License {
  /** Unique license identifier */
  licenseId: string;

  /** Human or institution issuing the license */
  grantorId: string;

  /** Recipient of the license rights */
  granteeId: string;

  /** Scope of rights granted */
  scope: LicenseScope;

  /** Current license status */
  status: LicenseStatus;

  // Lifecycle timestamps
  /** Unix timestamp when license was proposed */
  proposedAt: number;

  /** Who proposed the license (may differ from grantor) */
  proposedBy: string;

  /** Unix timestamp of human ratification */
  ratifiedAt?: number;

  /** Natural language ratification statement by grantor */
  ratificationStatement?: string;

  /** Unix timestamp when license became active */
  activatedAt?: number;

  // Revocation
  /** Unix timestamp of revocation */
  revokedAt?: number;

  /** Natural language revocation statement */
  revocationStatement?: string;

  /** Cryptographic signature on revocation */
  revocationSignature?: string;

  // Immutable references
  /** Hashes of underlying artifacts (receipts, agreements, etc.) */
  underlyingReferences: string[];

  /** SHA-256 hash of license contents */
  licenseHash: string;

  // Metadata
  /** Must be true for valid ratification per NCIP-012 */
  humanAuthorship: boolean;

  /** Cryptographic signature on license */
  signature?: string;
}

/**
 * Delegation status in the ratification pipeline.
 *
 * - `proposed`: Delegation terms proposed, awaiting delegator ratification
 * - `ratified`: Delegator has explicitly consented
 * - `active`: Delegation is in effect
 * - `expired`: Time-bounded delegation has expired
 * - `revoked`: Delegation explicitly revoked
 *
 * @see MP-04 for delegation lifecycle
 */
export type DelegationStatus = 'proposed' | 'ratified' | 'active' | 'expired' | 'revoked';

/**
 * Scope definition for a delegation grant.
 *
 * Defines what powers are delegated, their constraints, revocation conditions,
 * duration, and whether the delegate can redelegate to others.
 *
 * @see MP-04 for delegation scope requirements
 */
export interface DelegationScope {
  /** Specific powers granted in natural language */
  delegatedPowers: string[];

  /** Limitations on delegated powers */
  constraints: string[];

  /** Conditions that trigger automatic revocation */
  revocationConditions: string[];

  /** Duration constraints */
  duration: {
    /** Whether delegation is perpetual or time-limited */
    type: 'perpetual' | 'time_bounded';
    /** Expiration timestamp for time_bounded delegations */
    expiresAt?: number;
  };

  /** Redelegation permissions */
  transferability: {
    /** Whether delegate can redelegate to others */
    redelegationAllowed: boolean;
    /** Maximum redelegation chain depth (default: 3) */
    maxRedelegationDepth?: number;
  };
}

/**
 * Delegation grant conferring decision-making authority.
 *
 * A DelegationGrant allows a human to delegate specific powers to an agent
 * or another human. Delegations require human ratification per NCIP-012
 * and are tracked for scope violations.
 *
 * Redelegation chains are tracked via parentDelegationId and redelegationDepth
 * to prevent authority dilution beyond configured limits.
 *
 * @see MP-04 for delegation lifecycle and scope tracking
 * @see NCIP-012 for ratification requirements (24h cooling period)
 */
export interface DelegationGrant {
  /** Unique delegation identifier */
  delegationId: string;

  /** Human delegating authority */
  delegatorId: string;

  /** Agent or human receiving authority */
  delegateId: string;

  /** Scope of powers delegated */
  scope: DelegationScope;

  /** Current delegation status */
  status: DelegationStatus;

  // Lifecycle timestamps
  /** Unix timestamp when delegation was proposed */
  proposedAt: number;

  /** Who proposed the delegation */
  proposedBy: string;

  /** Unix timestamp of human ratification */
  ratifiedAt?: number;

  /** Natural language ratification statement */
  ratificationStatement?: string;

  /** Unix timestamp when delegation became active */
  activatedAt?: number;

  // Revocation
  /** Unix timestamp of revocation */
  revokedAt?: number;

  /** Natural language revocation statement */
  revocationStatement?: string;

  /** Cryptographic signature on revocation */
  revocationSignature?: string;

  // Redelegation chain tracking
  /** Parent delegation ID if this is a redelegation */
  parentDelegationId?: string;

  /** Depth in redelegation chain (0 = original delegation) */
  redelegationDepth: number;

  // Metadata
  /** Must be true for valid ratification per NCIP-012 */
  humanAuthorship: boolean;

  /** Cryptographic signature on delegation */
  signature?: string;

  /** SHA-256 hash of delegation contents */
  delegationHash: string;
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
//
// MP-05 bridges NatLangChain agreements to real-world value through structured
// settlement and capitalization. It provides:
// - Mutual declaration of settlement by all parties
// - Staged/milestone settlements for complex agreements
// - Capitalization events transforming settlements into value instruments
// - Integration with external financial and legal systems
//
// Key constraints:
// - Settlement requires human ratification per NCIP-012 (24h cooling period)
// - Must reference MP-01 agreements, MP-02 receipts, and/or MP-04 licenses
// - Disputes trigger MP-03 escalation automatically
//
// @see MP-05-spec.md for full protocol specification
// @see NCIP-012 for Human Ratification UX requirements
// ============================================================================

/**
 * MP-05 Settlement status in the declaration pipeline.
 *
 * - `declared`: Initial declaration by one or more parties
 * - `ratified`: All required parties have declared (per NCIP-012)
 * - `finalized`: Settlement is complete and immutable
 * - `contested`: Under dispute via MP-03
 * - `reversed`: Reversed by new declaration (requires all parties)
 *
 * @see MP-05 for settlement lifecycle
 * @see NCIP-012 for ratification requirements
 */
export type MP05SettlementStatus =
  | 'declared'      // Initial declaration by one or more parties
  | 'ratified'      // All required parties have declared
  | 'finalized'     // Settlement is complete and immutable
  | 'contested'     // Under dispute (MP-03)
  | 'reversed';     // Reversed by new declaration

/**
 * Value type for capitalization events.
 *
 * Defines how settlement value is transformed into real-world instruments:
 * - `payment_claim`: Direct payment or compensation
 * - `revenue_share`: Ongoing revenue sharing arrangement
 * - `equity_interest`: Ownership stake
 * - `token`: Tokenized representation
 * - `contractual_right`: Legal rights or obligations
 * - `other`: Custom value type
 *
 * @see MP-05 for capitalization requirements
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