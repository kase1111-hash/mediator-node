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
