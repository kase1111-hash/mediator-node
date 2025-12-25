/**
 * NCIP Definitions for Tooltip Hover Tips
 *
 * These definitions provide contextual documentation throughout the UI,
 * referencing the canonical NCIP specifications.
 */

export const ncipDefinitions = {
  // Navigation items
  dashboard: {
    text: 'Overview of mediator node status, active settlements, and key metrics.',
    ncipRef: null,
  },
  settlements: {
    text: 'Proposed settlements between aligned intents. Settlements require human ratification per NCIP-012.',
    ncipRef: 'NCIP-012',
  },
  intents: {
    text: 'Human-authored expressions of desired outcome recorded on-chain. Intents are the primary semantic input to the protocol.',
    ncipRef: 'NCIP-001',
  },
  reputation: {
    text: 'Mediator reputation is earned through accurate, aligned, and non-coercive mediation. Trust is earned only through on-chain behavior.',
    ncipRef: 'NCIP-010',
  },
  disputes: {
    text: 'Challenges and disputes against proposed settlements. Disputes can escalate to external authorities.',
    ncipRef: 'NCIP-005',
  },
  configuration: {
    text: 'Mediator node configuration including consensus mode, fees, and protocol parameters.',
    ncipRef: null,
  },

  // Dashboard stats
  activeSettlements: {
    text: 'Settlements currently awaiting party acceptance. Default acceptance window is 72 hours.',
    ncipRef: 'MP-01',
  },
  pendingIntents: {
    text: 'Intents awaiting alignment with counterparty intents.',
    ncipRef: 'NCIP-001',
  },
  reputationWeight: {
    text: 'Calculated as: (Successful_Closures + Failed_Challenges x 2) / (1 + Upheld_Challenges_Against + Forfeited_Fees). Max effective weight: 0.35.',
    ncipRef: 'NCIP-010',
  },
  consensusMode: {
    text: 'Consensus mode determines how settlements are validated: permissionless (reputation-based), dpos (delegated stake), poa (authority), or hybrid.',
    ncipRef: 'NCIP-007',
  },
  totalBurned: {
    text: 'Tokens burned through filing fees, escalations, and load-scaled costs. Burns fund dispute subsidies and harassment protection.',
    ncipRef: 'MP-06',
  },
  challengeRate: {
    text: 'Percentage of settlements that were challenged. Lower rates indicate higher alignment accuracy.',
    ncipRef: 'MP-03',
  },

  // Settlement details
  reasoningTrace: {
    text: 'LLM-generated explanation of how settlement terms were derived from the original intents.',
    ncipRef: 'NCIP-002',
  },
  proposedTerms: {
    text: 'Settlement terms subject to cognitive load limits: max 7 semantic units for simple agreements, 9 for financial settlements.',
    ncipRef: 'NCIP-012',
  },
  facilitationFee: {
    text: 'Fee earned by the mediator for successful settlement facilitation.',
    ncipRef: 'MP-01',
  },
  modelIntegrityHash: {
    text: 'SHA-256 hash of the LLM prompt and response for reproducibility verification.',
    ncipRef: null,
  },
  acceptanceDeadline: {
    text: 'Deadline for party acceptance. Default: 72 hours from proposal.',
    ncipRef: 'MP-01',
  },
  semanticVerification: {
    text: 'Multi-mediator verification for high-value settlements. Requires 3+ semantically equivalent summaries.',
    ncipRef: 'NCIP-007',
  },

  // Intent details
  intent: {
    text: 'A human-authored expression of desired outcome or commitment, recorded as prose.',
    ncipRef: 'NCIP-001',
  },
  desires: {
    text: 'Explicit list of positive goals the author wants to achieve.',
    ncipRef: 'NCIP-001',
  },
  constraints: {
    text: 'Boundaries that must not be violated in any settlement. Violation triggers challenge eligibility.',
    ncipRef: 'MP-03',
  },
  semanticDrift: {
    text: 'Drift levels: D0-D1 auto-accept, D2 warn + review, D3 escalation required, D4 reject.',
    ncipRef: 'NCIP-002',
  },

  // Reputation details
  successfulClosures: {
    text: 'Count of settlements successfully closed. Increases reputation weight numerator.',
    ncipRef: 'NCIP-010',
  },
  failedChallenges: {
    text: 'Challenges submitted that were rejected. Weighted x2 in reputation formula.',
    ncipRef: 'NCIP-010',
  },
  upheldChallenges: {
    text: 'Challenges against settlements that were upheld. Increases weight denominator and triggers slashing.',
    ncipRef: 'NCIP-010',
  },
  slashing: {
    text: 'Automatic, deterministic penalties for offenses: semantic manipulation (10-30%), repeated invalid proposals (5-15%), coercive framing (15%).',
    ncipRef: 'NCIP-010',
  },
  compositeScore: {
    text: 'CTS = w1*AR + w2*SA + w3*AS + w4*DA - w5*CS - w6*Late. Affects proposal ranking and validator attention.',
    ncipRef: 'NCIP-010',
  },

  // Dispute details
  dispute: {
    text: 'A formally raised assertion of misinterpretation, constraint violation, or semantic contradiction.',
    ncipRef: 'NCIP-005',
  },
  clarificationPhase: {
    text: 'Optional AI-assisted phase to narrow scope and identify specific disagreements.',
    ncipRef: 'MP-03',
  },
  escalation: {
    text: 'Escalation to external authority (arbitrator, DAO, court). Must be human-authored per NCIP-012.',
    ncipRef: 'NCIP-012',
  },
  coolingPeriod: {
    text: 'Mandatory delays: 12h for agreements, 24h for settlements/licensing, 6h for disputes.',
    ncipRef: 'NCIP-012',
  },

  // Proof of Effort
  effortReceipt: {
    text: 'Cryptographic record attesting work occurred, validated by LLM and anchored on-chain.',
    ncipRef: 'MP-02',
  },
  validationAssessment: {
    text: 'LLM evaluation of coherence, progression, consistency, and synthesis scores.',
    ncipRef: 'MP-02',
  },

  // Licensing & Delegation
  license: {
    text: 'Grant of specific rights over artifacts. Requires human ratification with 24h cooling period.',
    ncipRef: 'MP-04',
  },
  delegation: {
    text: 'Grant of decision-making authority. Maximum redelegation depth: 3.',
    ncipRef: 'MP-04',
  },

  // Human Ratification
  humanRatification: {
    text: 'If a human cannot reasonably understand the decision surface, ratification is invalid.',
    ncipRef: 'NCIP-012',
  },
  cognitiveLoadBudget: {
    text: 'Hard limits on semantic units: 7 for simple, 9 for financial/licensing, 5 for disputes, 3 for emergencies.',
    ncipRef: 'NCIP-012',
  },
  proofOfUnderstanding: {
    text: 'User must view a PoU paraphrase and confirm or correct it before ratification.',
    ncipRef: 'NCIP-004',
  },
};
