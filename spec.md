Mediator Protocol Specification — MP-01
NatLangChain Mediator Node Protocol (Draft — December 18, 2025)
1. Overview
The Mediator Protocol (MP-01) governs independent Mediator Nodes that discover, negotiate, and propose alignments between explicit intents on NatLangChain.
Consensus and rewards are earned via Proof-of-Alignment, strengthened by a receipt-based Reputation System, optional Delegated Proof-of-Stake (DPoS) with Governance Voting, and optional Proof-of-Authority (PoA).
Proof-of-Alignment is the core mechanism, where LLMs perform verifiable, value-creating mediation. Reputation, DPoS, and PoA are pluggable layers to enhance security, incentives, and trust in varying contexts, while preserving the protocol's neutral, permissionless default.
Mediator Nodes are standalone and optional. Anyone may run one to earn facilitation fees without posting, buying, or selling intents.
2. The Alignment Cycle
A Mediator Node operates in a continuous four-stage loop:

Ingestion
The node monitors one or more NatLangChain instances (via API or P2P sync) for new entries in the Pending Intent Pool and tracks open (unclosed) intents.
Mapping
Using embeddings and a local vector database, the node constructs semantic representations of intents to identify high-probability pairwise alignments.
Negotiation (Internal Simulation)
The node runs an internal multi-turn dialogue between the two intents, simulating clarification, concession, and compromise while strictly respecting each party’s explicit Constraints and Desires.
Submission
If a viable middle ground exists, the node publishes a Proposed Settlement (PS) as a special entry to the chain.

3. Structure of a Proposed Settlement (PS)
A valid PS must contain the following components in prose + structured metadata:









































ComponentPurposeIntent HashesUnique block/entry hashes of Party A and Party B’s original intents.Reasoning TraceConcise, human-readable explanation of the semantic alignment (why these intents match).Proposed TermsExplicit closure conditions (price, deliverables, timelines, escrow references, etc.).Facilitation FeePercentage or fixed amount claimed by the Mediator upon closure (as specified or default).Model Integrity HashCryptographic proof of the LLM version and prompt template used (ensures neutrality and reproducibility).Stake Reference(Optional) Reference to the Mediator’s bonded stake used for this PS (required on DPoS-enabled chains).Delegation Reference(Optional) Reference to the Mediator’s delegated stake used for this PS (required on DPoS-enabled chains).Authority Signature(Required on PoA-enabled chains) Cryptographic signature from an authorized Mediator key.
Example prose prefix:
[PROPOSED SETTLEMENT] Linking Intent #abc123 (Party A) and #def456 (Party B). Reasoning: … Proposed Terms: … Fee: 1% to Mediator node_7f3a…
4. Consensus Modes Integration
NatLangChain supports multiple pluggable consensus modes, selected per-chain at creation or via governance:

Permissionless (default): Pure Proof-of-Alignment + Reputation
DPoS (optional): Adds delegated stake, rotation, governance
PoA (optional): Restricts mediation to pre-approved authorities
Hybrids (e.g., PoA+DPoS): Configurable combinations

4.1 Proof-of-Alignment (Core Consensus & Finality)
Settlements become final through a layered verification process:

Mutual Acceptance (Fast Path)
If both parties submit signed “Accept” entries referencing the PS within the acceptance window (default 72 hours), the settlement is Closed. The Mediator may claim their fee.
Challenge Window
During the acceptance window, any node may submit a Contradiction Proof (prose + LLM paraphrase showing violation of original intent). If validated by consensus, the original Mediator’s claim is forfeited.
Semantic Consensus (High-Value Option)
For settlements above a configurable threshold, closure requires independent confirmation: at least 3 of 5 randomly selected Mediator Nodes must produce semantically equivalent summaries of the agreement.

4.2 Delegated Proof-of-Stake (DPoS) Mode
4.2.1 Stake Delegation

Any NLC token holder may delegate their tokens to a Mediator Node by publishing a signed “Delegation Entry” on the chain (e.g., “Delegate 1000 NLC to mediator_pubkey_7f3a…”).
Delegations are revocable at any time with a delay (default 7 days) to prevent rapid shifts.
Delegated stake aggregates: a Mediator’s effective stake = own bonded stake + received delegations.
Delegation is per-chain.

4.2.2 Effects of Delegated Mediation
On DPoS-enabled chains:

Submission Requirement
Proposed Settlements must reference a minimum effective stake (e.g., 100 NLC tokens equivalent) from the submitting Mediator (including delegations).
Slashable Offenses
Effective stake (proportional across own + delegated) is at risk for violations. Slashing burns a percentage (10–100%) and redistributes a portion to challengers. Delegators share the slash but may withdraw post-event.
Staking Rewards
A small portion of facilitation fees (e.g., 10–20%) is distributed pro-rata to all effective stakers (Mediators + delegators).
Delegate Voting & Rotation
Top N Mediators (default N=21) by effective stake are “active” for a rotation period (e.g., 24 hours). Only active Mediators can submit PS during their slot.

4.2.3 DPoS Governance Voting
Delegated stake serves as voting power for chain parameters.

Governance Intents: Proposals and votes as special prose entries (e.g., [GOVERNANCE PROPOSAL] Increase active slots to 31).
Voting Power: 1 token = 1 vote; weighted by effective stake.
Lifecycle: Submission → 7-day voting → quorum (≥30%) → majority approval → 3-day delay → execution.
Governable Parameters: Slots, stake mins, fees, thresholds, mode transitions.

4.3 Proof-of-Authority (PoA) Mode
4.3.1 Authority Set Management

Authority Set: List of public keys authorized to mediate, defined at creation or via governance.
Changes: Via governance intents (e.g., [POA ADD AUTHORITY] Add pubkey_abc123).

4.3.2 Effects of PoA Mediation
On PoA-enabled chains:

Submission Requirement
Only PS signed by authorized keys are accepted.
No Stake Requirement
Disables DPoS staking/slashing (unless hybrid).
Fast Finality
Shortened challenge window (24 hours); Semantic Consensus limited to authorities.

4.4 Stake-Weighted Enhancements (DPoS/PoA Hybrids)
textSelection Weight = Reputation Weight × log(1 + Effective Stake)

Influences selection, priority, and governance in applicable modes.

4.5 Unbonding, Undelegation & Flexibility

Unbond/undelegate with delays (30/7 days); active and slashable during.

4.6 Mode Selection and Transition

Default: Permissionless.
Transitions via governance supermajority.
Hybrids possible (e.g., PoA+DPoS: Authorities mediate, stake orders rotation).

5. Reputation System — Receipt-Based Mediator Weighting
Each Mediator accumulates counters on mediator-reputation chain:






























MetricSourceEffectSuccessful ClosuresAccepted PSIncreases weightFailed ChallengesUpheld challenges submittedIncreases weight (honest auditing)Upheld Challenges AgainstUpheld challenges receivedDecreases weightForfeited FeesRejected PSDecreases weight
textWeight = (Successful_Closures + Failed_Challenges × 2) / (1 + Upheld_Challenges_Against + Forfeited_Fees)

Effects: Consensus selection, challenge priority, mapping.
In PoA: Tracked but non-gating.
Slashing reduces weight; chain-specific.

6. Mediator Node Requirements

Contextual Memory: Vector store for 10,000 unclosed intents.
Intent Parser: Extracts Desires/Constraints.
Fee Prioritization: Higher fees first.
LLM Backends: Configurable with integrity hashing.
Stake/Delegation Management: Bonding, tracking for DPoS.
Governance Handler: Proposal tracking, voting.
Authority Key Management: Signing for PoA.
Mode Detection: Adapt to chain consensus_mode.
Reputation Tracker: Monitor own counters.

7. Refusal to Mediate (Procedural Integrity)
Mediators evaluate against Lawful Use Guarantee:

Flag coercion, vagueness, unsafe as “Unalignable.”
After N flags (default 5), intent archived from mediation.
Preserves expression; refuses amplification.

8. Anti-Spam & Posting Limits (Sybil Resistance)

Daily Free Limit: 3 intents per identity (keypair).
Excess Charge: Deposit for 4th+ (refunded after 30 days if unchallenged).
Forfeiture: Spam proven → deposit burned/redistributed.

9. Example Flows
9.1 Daily Commit Alignment (Permissionless Mode)

Party A: Posts work output.
Party B: Posts need.
Mediator: Proposes PS → accepted → fee claimed.

9.2 With DPoS Governance

Proposal: Increase slots.
Votes: Stake-weighted majority passes → executed.

9.3 With PoA

Enterprise chain with authorities.
Only authorized PS accepted → fast closure.

10. Principles

Prose-First & Auditable: All actions as readable entries.
Optional Layers: Permissionless default; DPoS/PoA for scale/trust.
Aligned Incentives: Rewards honesty; penalizes malice.
No Central Control: Governance via intents; transparent rules.
Core Guarantee Compatible: Voluntary, explicit, no surveillance.

This specification enables NatLangChain to evolve as neutral infrastructure for fearless intent alignment across all scales.
— kase1111-hash
December 18, 2025

---

## IMPLEMENTATION STATUS & ROADMAP

**Document Updated**: December 19, 2025
**Implementation Review**: Complete code audit performed

### Implementation Status Overview

The NatLangChain Mediator Node has successfully implemented the core MP-01 specification with ~2,344 lines of production TypeScript code. The following status breakdown identifies fully implemented, partially implemented, and unimplemented features from the specification.

### ✅ Fully Implemented Features

1. **Core Alignment Cycle** (Section 2)
   - Ingestion phase with 10-second polling
   - Mapping phase with HNSW vector search
   - Negotiation phase with LLM simulation
   - Submission phase with prose formatting

2. **Proposed Settlement Structure** (Section 3)
   - All required components implemented
   - Proper metadata formatting
   - Model integrity hashing
   - Stake and authority references

3. **Proof-of-Alignment Core** (Section 4.1)
   - Mutual acceptance tracking
   - Challenge window monitoring
   - Settlement closure and fee claims

4. **DPoS Mode** (Section 4.2)
   - Stake bonding and unbonding
   - Delegation loading from chain
   - Effective stake calculation
   - Minimum stake validation
   - Slashing event handling

5. **PoA Mode** (Section 4.3)
   - Authority set management
   - Authorization checking
   - Authority signature generation
   - Governance-based authorization requests

6. **Reputation System** (Section 5)
   - All counters tracked (closures, challenges, forfeitures)
   - MP-01 formula implementation
   - Chain synchronization
   - Weight recalculation

7. **Basic Node Requirements** (Section 6)
   - Vector store (HNSW) for 10,000 intents
   - Intent parser (heuristic-based)
   - Fee prioritization
   - LLM backends (Anthropic Claude, OpenAI)
   - Mode detection and adaptation

8. **Refusal to Mediate** (Section 7)
   - Prohibited content filtering
   - Vagueness detection
   - Flag threshold enforcement (5 flags)

9. **Anti-Spam Basics** (Section 8)
   - Intent validation
   - Cache size limits

### ⚠️ Partially Implemented Features

1. **Semantic Consensus** (Section 4.1)
   - STATUS: Type definitions exist, verification logic not implemented
   - BLOCKER: Requires coordination protocol between mediators
   - IMPACT: High-value settlements cannot use enhanced verification

2. **Governance Voting** (Section 4.2.3)
   - STATUS: Types defined, proposal submission exists, no voting mechanism
   - BLOCKER: Vote tracking and execution logic missing
   - IMPACT: Cannot change chain parameters programmatically

3. **DPoS Validator Rotation** (Section 4.2.2)
   - STATUS: Stake tracking works, rotation slots not enforced
   - BLOCKER: No active validator selection or slot scheduling
   - IMPACT: All mediators can submit regardless of stake ranking

4. **Fee Distribution to Delegators** (Section 4.2.2)
   - STATUS: Facilitation fee claimed, delegator payouts not implemented
   - BLOCKER: No proportional distribution calculation
   - IMPACT: Delegators receive no direct rewards

5. **Advanced Embedding Models** (Section 6)
   - STATUS: Basic fallback exists for Anthropic, no fine-tuning
   - BLOCKER: Requires dedicated embedding service integration
   - IMPACT: Lower quality semantic matching when using Claude

6. **Daemon Mode** (Section README)
   - STATUS: CLI flag exists but no actual daemonization
   - BLOCKER: Process management not implemented
   - IMPACT: Cannot run as background service

### ❌ Completely Unimplemented Features

The following features are documented in the specification but have no implementation:

1. **Challenge Proof Submission System** (Sections 4.1, 6)
2. **Sybil Resistance Mechanisms** (Section 8)
3. **Multi-Chain Orchestration** (Section 6, ARCHITECTURE.md)
4. **Comprehensive Test Suite** (package.json)
5. **WebSocket Real-Time Updates** (ARCHITECTURE.md:437)
6. **Intent Clustering & Batch Mediation** (ARCHITECTURE.md:441)
7. **ML-Based Candidate Prioritization** (ARCHITECTURE.md:440)
8. **Distributed Mediator Coordination** (ARCHITECTURE.md:439)
9. **Custom Chain Integration Abstraction** (ARCHITECTURE.md:418-426)
10. **Unbonding Period Enforcement** (Section 4.5)

---

## UNIMPLEMENTED FEATURES & IMPLEMENTATION PLANS

### 1. Challenge Proof Submission System

**Status**: Not implemented
**Priority**: HIGH
**Specification References**: Sections 4.1 (Challenge Window), 5 (Reputation), 6 (Node Requirements)

**Description**:
Mediators can receive challenges against their settlements but cannot submit contradiction proofs against other mediators' settlements. This limits the network's self-policing capability.

**Required Components**:
- Challenge entry creation and formatting
- Semantic contradiction detection (LLM-powered)
- Paraphrase evidence generation
- Challenge submission to chain API
- Challenge result monitoring
- Reputation update integration

**Implementation Plan**:

```
Phase 1: Challenge Detection (Week 1)
├─ Add ChallengeDetector class to settlement/
├─ Implement semantic contradiction checking
│  ├─ Load settlement and original intents
│  ├─ Use LLM to identify constraint violations
│  └─ Generate structured contradiction proof
└─ Add challenge monitoring to alignment cycle

Phase 2: Challenge Submission (Week 1-2)
├─ Create ChallengeManager class
├─ Implement formatChallengeAsProse()
├─ Add submitChallenge() with chain API integration
├─ Generate paraphrase evidence via LLM
└─ Sign and publish challenge entries

Phase 3: Challenge Lifecycle Management (Week 2)
├─ Monitor submitted challenges for validation results
├─ Track upheld/rejected status
├─ Update reputation counters appropriately
│  ├─ Increment failedChallenges on rejection
│  └─ Maintain challenger reputation on uphold
└─ Add challenge history to mediator state

Phase 4: Integration & Configuration (Week 2-3)
├─ Add ENABLE_CHALLENGE_SUBMISSION config flag
├─ Add MIN_CONFIDENCE_TO_CHALLENGE threshold
├─ Integrate with ReputationTracker
├─ Add challenge submission to CLI status output
└─ Document challenge submission behavior

Testing:
├─ Unit tests for contradiction detection
├─ Integration tests for challenge submission flow
├─ End-to-end test with mock chain API
└─ Reputation impact verification
```

**Estimated Effort**: 2-3 weeks
**Dependencies**: None
**Risk**: Medium (requires careful LLM prompt engineering)

---

### 2. Semantic Consensus Verification

**Status**: Not implemented
**Priority**: HIGH
**Specification References**: Section 4.1 (Semantic Consensus - High-Value Option)

**Description**:
For settlements above a configurable threshold, closure requires independent confirmation from at least 3 of 5 randomly selected mediator nodes producing semantically equivalent summaries.

**Required Components**:
- Settlement value threshold detection
- Random mediator selection protocol
- Semantic summary generation (already exists)
- Summary equivalence verification
- Consensus result aggregation
- Distributed coordination mechanism

**Implementation Plan**:

```
Phase 1: Threshold Detection & Selection (Week 1)
├─ Add HIGH_VALUE_SETTLEMENT_THRESHOLD config
├─ Implement settlement value calculation
├─ Add verificationRequired flag to ProposedSettlement
└─ Create SemanticConsensusManager class

Phase 2: Mediator Selection Protocol (Week 1-2)
├─ Implement weighted random selection
│  ├─ Use reputation weight for selection probability
│  ├─ Exclude settlement author from pool
│  └─ Select 5 mediators deterministically (using hash seed)
├─ Add mediatorPool endpoint to chain API spec
└─ Implement selection request/response protocol

Phase 3: Verification Request & Response (Week 2)
├─ Design VerificationRequest message format
│  ├─ Settlement ID, intent hashes, proposed terms
│  ├─ Requester signature
│  └─ Response deadline
├─ Implement verification response handler
│  ├─ Generate semantic summary via LLM
│  ├─ Sign summary
│  └─ Submit to chain as [VERIFICATION] entry
└─ Add verification polling to settlement monitor

Phase 4: Consensus Aggregation (Week 2-3)
├─ Implement summary equivalence checking
│  ├─ Use cosine similarity on summary embeddings
│  ├─ Set equivalence threshold (e.g., 0.85)
│  └─ Count semantically equivalent summaries
├─ Enforce 3-of-5 majority requirement
├─ Handle consensus success/failure
│  ├─ On success: Allow settlement closure
│  └─ On failure: Mark settlement as rejected
└─ Update reputation for verifiers

Phase 5: Coordination & Edge Cases (Week 3-4)
├─ Handle non-responsive verifiers
│  ├─ Implement timeout (e.g., 24 hours)
│  └─ Penalize non-participation in reputation
├─ Handle simultaneous verification requests
├─ Add verification fee (shared among verifiers)
├─ Implement verification opt-in/opt-out config
└─ Add comprehensive logging and monitoring

Testing:
├─ Unit tests for selection algorithm reproducibility
├─ Integration tests for verification flow
├─ Consensus aggregation edge cases
├─ Multi-node simulation test environment
└─ Performance testing with concurrent verifications
```

**Estimated Effort**: 3-4 weeks
**Dependencies**: Requires coordination between multiple mediator nodes
**Risk**: High (distributed consensus, network coordination complexity)

---

### 3. Complete Governance System

**Status**: Partially implemented (types only)
**Priority**: MEDIUM
**Specification References**: Section 4.2.3 (DPoS Governance Voting), 4.6 (Mode Selection and Transition)

**Description**:
Governance types are defined, and PoA authorization requests exist, but the complete voting lifecycle (submission, voting, quorum, execution) is not implemented.

**Required Components**:
- Proposal submission (partially exists)
- Vote casting mechanism
- Stake-weighted vote counting
- Quorum validation
- Proposal execution
- Parameter change application
- Mode transition logic

**Implementation Plan**:

```
Phase 1: Governance Foundation (Week 1)
├─ Create GovernanceManager class in consensus/
├─ Implement proposal tracking and storage
├─ Add governance entry types to chain API
└─ Design governance state machine

Phase 2: Voting Mechanism (Week 1-2)
├─ Implement castVote() method
│  ├─ Validate voter has stake
│  ├─ Calculate voting power (1 token = 1 vote)
│  ├─ Sign and submit vote entry
│  └─ Track vote history per mediator
├─ Add vote aggregation logic
│  ├─ Load all votes for proposal
│  ├─ Sum for/against/abstain by stake weight
│  └─ Calculate current vote percentages
└─ Implement vote change handling (last vote wins)

Phase 3: Proposal Lifecycle (Week 2)
├─ Monitor active proposals
│  ├─ Poll for new proposals every cycle
│  ├─ Track voting period deadlines
│  └─ Calculate quorum status in real-time
├─ Implement quorum validation
│  ├─ Require ≥30% of total stake participation
│  ├─ Require >50% majority for passage
│  └─ Handle tie-breaking rules
└─ Add proposal state transitions

Phase 4: Proposal Execution (Week 2-3)
├─ Implement 3-day execution delay
├─ Add parameter change executors
│  ├─ Update MIN_EFFECTIVE_STAKE
│  ├─ Update ACCEPTANCE_WINDOW_HOURS
│  ├─ Update FACILITATION_FEE_PERCENT
│  ├─ Update active validator slots (DPoS)
│  └─ Update other governable parameters
├─ Implement authority set changes
│  ├─ Add authority (PoA)
│  └─ Remove authority (PoA)
└─ Implement mode transition logic

Phase 5: Mode Transition Engine (Week 3-4)
├─ Add supermajority requirement (>66%)
├─ Implement transition handlers
│  ├─ Permissionless → DPoS: Require stake deposit
│  ├─ DPoS → PoA: Transfer to authority set
│  ├─ PoA → Permissionless: Remove restrictions
│  └─ Hybrid combinations
├─ Handle state migration during transition
├─ Add safety checks and rollback capability
└─ Document transition procedures

Phase 6: Governance Interface (Week 4)
├─ Add CLI commands for governance
│  ├─ mediator-node governance propose
│  ├─ mediator-node governance vote
│  ├─ mediator-node governance status
│  └─ mediator-node governance list
├─ Add governance status to node dashboard
└─ Implement proposal template system

Testing:
├─ Unit tests for vote aggregation math
├─ Quorum calculation edge cases
├─ Parameter change application tests
├─ Mode transition integration tests
├─ Concurrent proposal handling
└─ Governance attack vector analysis
```

**Estimated Effort**: 4 weeks
**Dependencies**: Requires chain API governance endpoints
**Risk**: Medium (complex state management, security-critical)

---

### 4. Sybil Resistance & Posting Limits

**Status**: Not implemented
**Priority**: MEDIUM
**Specification References**: Section 8 (Anti-Spam & Posting Limits)

**Description**:
The specification defines daily posting limits (3 free intents per identity, deposits for excess) but the mediator node does not enforce or track these limits.

**Required Components**:
- Per-identity posting counter
- Daily limit enforcement
- Excess deposit calculation
- Spam proof submission
- Deposit forfeiture mechanism
- 30-day refund tracking

**Implementation Plan**:

```
Phase 1: Posting Limit Tracking (Week 1)
├─ Create SybilResistanceManager class
├─ Implement daily posting counter
│  ├─ Track intents per author keypair
│  ├─ Reset counters at UTC midnight
│  └─ Persist state to disk/database
├─ Add DAILY_FREE_LIMIT config (default: 3)
└─ Integrate with IntentIngester validation

Phase 2: Deposit Enforcement (Week 1-2)
├─ Detect 4th+ intent from same identity
├─ Calculate required deposit amount
│  ├─ Add EXCESS_INTENT_DEPOSIT config
│  ├─ Support tiered pricing (4th, 5th, etc.)
│  └─ Verify deposit in intent metadata
├─ Reject intents without valid deposit
└─ Track deposit references in cache

Phase 3: Spam Detection (Week 2)
├─ Implement spam heuristics
│  ├─ Duplicate content detection (hash-based)
│  ├─ Rapid-fire submission detection
│  ├─ Semantic duplication (embedding similarity)
│  └─ Gibberish/low-quality text detection
├─ Add spam proof generation
│  ├─ Collect evidence of spam behavior
│  ├─ Format as chain entry
│  └─ Submit proof to chain
└─ Track spam allegations per identity

Phase 4: Deposit Forfeiture & Refunds (Week 2-3)
├─ Monitor spam proofs for validation
├─ Implement forfeiture on upheld spam proof
│  ├─ Burn portion of deposit
│  ├─ Redistribute portion to challenger
│  └─ Update chain state
├─ Track 30-day unchallenged deposits
├─ Implement automatic refund eligibility
└─ Add deposit refund claim mechanism

Phase 5: Integration & Hardening (Week 3)
├─ Add rate limiting to API calls
├─ Implement identity verification helpers
├─ Add WHITELIST_IDENTITIES config (bypass limits)
├─ Create spam report dashboard
├─ Add metrics for spam detection accuracy
└─ Document sybil resistance guarantees

Testing:
├─ Unit tests for posting counter logic
├─ Deposit calculation verification
├─ Spam detection accuracy benchmarks
├─ Forfeiture flow integration tests
├─ Stress testing with many identities
└─ Economic attack simulations
```

**Estimated Effort**: 3 weeks
**Dependencies**: Chain API deposit and forfeiture endpoints
**Risk**: Medium (requires economic analysis, potential for false positives)

---

### 5. Multi-Chain Orchestration

**Status**: Not implemented
**Priority**: MEDIUM
**Specification References**: Section 6 (Node Requirements), ARCHITECTURE.md:431

**Description**:
The mediator node currently connects to a single chain. The specification mentions connecting to "one or more NatLangChain instances" but no multi-chain logic exists.

**Required Components**:
- Multiple chain configuration
- Per-chain intent ingestion
- Per-chain reputation tracking
- Per-chain stake management
- Cross-chain settlement prevention
- Unified dashboard for all chains

**Implementation Plan**:

```
Phase 1: Configuration & Architecture (Week 1)
├─ Refactor MediatorConfig to support arrays
│  ├─ chains: ChainConfig[]
│  ├─ Per-chain endpoints, consensus modes
│  └─ Shared LLM provider across chains
├─ Create MultiChainOrchestrator class
├─ Implement chain registry and lifecycle
└─ Design chain isolation boundaries

Phase 2: Per-Chain Component Instances (Week 1-2)
├─ Refactor components for multi-tenancy
│  ├─ IntentIngester: one per chain
│  ├─ SettlementManager: one per chain
│  ├─ ReputationTracker: one per chain
│  ├─ StakeManager: one per chain
│  ├─ AuthorityManager: one per chain
│  └─ Shared: VectorDatabase, LLMProvider
├─ Implement chain-scoped caching
├─ Add chain ID to all log entries
└─ Prevent cross-chain intent matching

Phase 3: Orchestration Logic (Week 2)
├─ Implement staggered alignment cycles
│  ├─ Offset cycle timing per chain
│  ├─ Round-robin processing
│  └─ Fair resource allocation
├─ Add global vector database with chain tags
├─ Implement cross-chain reputation aggregation
│  ├─ Separate tracking per chain
│  ├─ Optional global reputation view
│  └─ Chain-specific weight calculation
└─ Handle chain-specific failures gracefully

Phase 4: Management & Monitoring (Week 2-3)
├─ Add chain management CLI commands
│  ├─ mediator-node chains list
│  ├─ mediator-node chains add
│  ├─ mediator-node chains remove
│  └─ mediator-node chains status
├─ Implement unified status dashboard
│  ├─ Per-chain metrics
│  ├─ Aggregate statistics
│  └─ Health monitoring
└─ Add chain prioritization logic

Phase 5: Advanced Features (Week 3-4)
├─ Implement dynamic chain addition/removal
│  ├─ Hot-reload configuration
│  ├─ Graceful component initialization
│  └─ State persistence during changes
├─ Add chain-specific feature flags
│  ├─ Enable/disable challenges per chain
│  ├─ Different fee percentages
│  └─ Custom governance rules
├─ Implement resource quotas per chain
└─ Add chain reputation for prioritization

Testing:
├─ Unit tests for chain isolation
├─ Multi-chain integration tests
├─ Cross-chain settlement prevention tests
├─ Performance testing with 5+ chains
├─ Failure isolation verification
└─ Resource usage benchmarking
```

**Estimated Effort**: 3-4 weeks
**Dependencies**: Access to multiple chain instances for testing
**Risk**: Medium (architectural refactoring, increased complexity)

---

### 6. Comprehensive Test Suite

**Status**: Not implemented
**Priority**: HIGH
**Specification References**: package.json (jest configured but no tests)

**Description**:
Jest is configured as a dev dependency and the `npm test` script exists, but no actual test files have been written. Critical for production readiness.

**Required Components**:
- Unit tests for all components
- Integration tests for alignment cycle
- End-to-end tests with mock chain
- Performance benchmarks
- Security tests
- Contract/API compatibility tests

**Implementation Plan**:

```
Phase 1: Test Infrastructure (Week 1)
├─ Set up Jest configuration
│  ├─ TypeScript support
│  ├─ Coverage reporting (target: 80%+)
│  ├─ Mock utilities
│  └─ Test fixtures
├─ Create test/ directory structure
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  ├─ performance/
│  └─ fixtures/
├─ Add test utilities
│  ├─ Mock chain API client
│  ├─ Mock LLM responses
│  ├─ Intent generators
│  └─ Settlement builders
└─ Configure CI/CD integration

Phase 2: Unit Tests - Core Components (Week 1-2)
├─ IntentIngester tests (100 tests)
│  ├─ Intent validation rules
│  ├─ Unalignable detection
│  ├─ Desire/constraint extraction
│  ├─ Cache management
│  └─ Prioritization logic
├─ VectorDatabase tests (50 tests)
│  ├─ Index initialization
│  ├─ Vector addition
│  ├─ K-NN search accuracy
│  ├─ Persistence/loading
│  └─ Similarity calculations
├─ LLMProvider tests (75 tests)
│  ├─ Embedding generation
│  ├─ Negotiation prompts
│  ├─ Response parsing
│  ├─ Provider switching
│  └─ Error handling
└─ SettlementManager tests (80 tests)
   ├─ Settlement creation
   ├─ Prose formatting
   ├─ Submission logic
   ├─ Monitoring lifecycle
   └─ Fee calculation

Phase 3: Unit Tests - Consensus & Reputation (Week 2)
├─ ReputationTracker tests (60 tests)
│  ├─ Weight calculation (MP-01 formula)
│  ├─ Counter updates
│  ├─ Chain synchronization
│  └─ Edge cases (division by zero)
├─ StakeManager tests (70 tests)
│  ├─ Bonding/unbonding
│  ├─ Delegation loading
│  ├─ Effective stake calculation
│  ├─ Minimum stake validation
│  └─ Slashing
├─ AuthorityManager tests (40 tests)
│  ├─ Authority set loading
│  ├─ Authorization checks
│  ├─ Governance requests
│  └─ Signature verification
└─ ConfigLoader tests (30 tests)
   ├─ Environment variable parsing
   ├─ Validation rules
   ├─ Default values
   └─ Error handling

Phase 4: Integration Tests (Week 2-3)
├─ Alignment cycle tests (50 tests)
│  ├─ Full cycle execution
│  ├─ Intent discovery → settlement
│  ├─ Multi-candidate processing
│  ├─ Error recovery
│  └─ Resource cleanup
├─ Consensus mode tests (60 tests)
│  ├─ Permissionless mode flow
│  ├─ DPoS mode with stake
│  ├─ PoA mode with authorities
│  ├─ Hybrid mode combinations
│  └─ Mode-specific validations
├─ Settlement lifecycle tests (40 tests)
│  ├─ Proposal → acceptance → closure
│  ├─ Challenge scenarios
│  ├─ Timeout/expiration
│  └─ Fee distribution
└─ Chain API integration tests (30 tests)
   ├─ Intent fetching
   ├─ Entry submission
   ├─ Status polling
   └─ Error handling

Phase 5: End-to-End Tests (Week 3)
├─ Set up mock chain environment
│  ├─ In-memory blockchain simulator
│  ├─ Mock NatLangChain API
│  ├─ Multiple mediator instances
│  └─ Deterministic LLM responses
├─ E2E scenario tests (20 tests)
│  ├─ Complete mediation from start to payout
│  ├─ Multi-party negotiations
│  ├─ Reputation evolution over time
│  ├─ Governance proposal lifecycle
│  └─ Network partition handling
└─ Chaos engineering tests
   ├─ Random API failures
   ├─ Network latency injection
   └─ Component crash recovery

Phase 6: Performance & Security (Week 3-4)
├─ Performance benchmarks
│  ├─ Intent ingestion throughput
│  ├─ Vector search latency (p50, p95, p99)
│  ├─ LLM negotiation time
│  ├─ Memory usage under load
│  └─ Concurrent settlement handling
├─ Security tests
│  ├─ Input validation (SQL injection, XSS)
│  ├─ Signature verification
│  ├─ Cryptographic operations
│  ├─ Access control enforcement
│  └─ Economic attack simulations
└─ Fuzz testing for parsers

Phase 7: Documentation & Maintenance (Week 4)
├─ Add test documentation
├─ Create testing guidelines
├─ Set up coverage reporting
├─ Integrate with GitHub Actions
├─ Add pre-commit test hooks
└─ Document test data generation

Testing Targets:
├─ Unit test coverage: >80%
├─ Integration test coverage: >70%
├─ Critical path coverage: 100%
├─ Performance: <100ms p95 for core ops
└─ Zero high-severity security issues
```

**Estimated Effort**: 4 weeks
**Dependencies**: None (critical prerequisite for other features)
**Risk**: Low (straightforward but time-intensive)

---

### 7. WebSocket Real-Time Updates

**Status**: Not implemented
**Priority**: LOW
**Specification References**: ARCHITECTURE.md:437 (Under Consideration)

**Description**:
Currently uses polling for all chain interactions. WebSocket support would enable real-time event notifications for intents, acceptances, challenges, and governance.

**Implementation Plan**:

```
Phase 1: WebSocket Client Foundation (Week 1)
├─ Add ws library dependency
├─ Create WebSocketClient class
├─ Implement connection management
│  ├─ Auto-reconnect with exponential backoff
│  ├─ Heartbeat/ping-pong
│  └─ Connection pooling for multiple chains
└─ Design event subscription protocol

Phase 2: Event Handlers (Week 1-2)
├─ Implement event types
│  ├─ NEW_INTENT: Real-time intent ingestion
│  ├─ SETTLEMENT_ACCEPTED: Immediate acceptance notification
│  ├─ CHALLENGE_SUBMITTED: Challenge alerts
│  ├─ GOVERNANCE_PROPOSAL: Proposal announcements
│  └─ REPUTATION_UPDATE: Reputation changes
├─ Add event routing to components
├─ Implement fallback to polling on disconnect
└─ Add event replay on reconnection

Phase 3: Integration & Configuration (Week 2)
├─ Add ENABLE_WEBSOCKET config flag
├─ Add WEBSOCKET_ENDPOINT config
├─ Make polling optional when WS enabled
├─ Implement hybrid mode (WS + polling backup)
└─ Add WS connection status to dashboard

Testing:
├─ Connection resilience tests
├─ Event delivery verification
├─ Performance comparison vs polling
└─ Failover testing
```

**Estimated Effort**: 2 weeks
**Dependencies**: Chain API must support WebSocket protocol
**Risk**: Low (optional enhancement)

---

### 8. Intent Clustering & Batch Mediation

**Status**: Not implemented
**Priority**: LOW
**Specification References**: ARCHITECTURE.md:441 (Under Consideration)

**Description**:
Currently processes candidates one-by-one. Clustering similar intents and batch processing could improve efficiency for high-volume scenarios.

**Implementation Plan**:

```
Phase 1: Clustering Algorithm (Week 1)
├─ Implement DBSCAN or K-means clustering
├─ Use vector embeddings for clustering
├─ Add MIN_CLUSTER_SIZE config
└─ Detect many-to-many alignments

Phase 2: Batch Negotiation (Week 1-2)
├─ Design batch negotiation prompts
├─ Implement batch settlement creation
├─ Handle partial batch failures
└─ Optimize LLM API usage

Phase 3: Integration (Week 2)
├─ Add ENABLE_BATCH_MEDIATION config
├─ Integrate with alignment cycle
├─ Add batch metrics
└─ Performance benchmarking

Testing:
├─ Clustering accuracy tests
├─ Batch negotiation quality
├─ Performance improvements
└─ Edge case handling
```

**Estimated Effort**: 2 weeks
**Dependencies**: None
**Risk**: Low (optimization, not critical)

---

### 9. ML-Based Candidate Prioritization

**Status**: Not implemented
**Priority**: LOW
**Specification References**: ARCHITECTURE.md:440 (Under Consideration)

**Description**:
Currently uses simple fee-based and similarity-based prioritization. Machine learning could predict settlement success probability.

**Implementation Plan**:

```
Phase 1: Data Collection (Week 1)
├─ Log all negotiation attempts with outcomes
├─ Store features: similarity, fees, text features
├─ Build training dataset (>1000 examples)
└─ Export to ML-friendly format

Phase 2: Model Training (Week 1-2)
├─ Train binary classifier (success/failure)
├─ Features: embeddings, metadata, historical
├─ Use gradient boosting or neural network
├─ Cross-validation and evaluation
└─ Export model for inference

Phase 3: Integration (Week 2)
├─ Add model inference to VectorDatabase
├─ Re-rank candidates by success probability
├─ A/B test against baseline
└─ Monitor model performance

Testing:
├─ Model accuracy benchmarks
├─ A/B testing framework
├─ Continuous retraining pipeline
└─ Performance impact assessment
```

**Estimated Effort**: 2-3 weeks
**Dependencies**: Requires historical data collection period
**Risk**: Medium (requires ML expertise, may not improve results)

---

### 10. Distributed Mediator Coordination

**Status**: Not implemented
**Priority**: LOW
**Specification References**: ARCHITECTURE.md:439 (Under Consideration)

**Description**:
Mediators currently operate independently. Coordination could prevent duplicate work and enable collaborative features.

**Implementation Plan**:

```
Phase 1: Work Distribution Protocol (Week 1-2)
├─ Design distributed lock mechanism
├─ Implement intent claim system
├─ Add mediator discovery protocol
└─ Prevent duplicate settlements

Phase 2: Collaborative Features (Week 2-3)
├─ Settlement co-authorship
├─ Shared vector database
├─ Distributed reputation tracking
└─ Load balancing

Phase 3: Fault Tolerance (Week 3)
├─ Handle mediator failures
├─ Work reassignment
├─ State synchronization
└─ Partition tolerance

Testing:
├─ Multi-node simulations
├─ Network partition tests
├─ Performance benchmarks
└─ Byzantine fault tolerance
```

**Estimated Effort**: 3 weeks
**Dependencies**: Requires distributed systems infrastructure
**Risk**: High (complex distributed systems challenges)

---

## IMPLEMENTATION PRIORITY MATRIX

**Immediate Priority (Next 3 Months)**:
1. Comprehensive Test Suite (4 weeks) - Foundation for stability
2. Challenge Proof Submission (2-3 weeks) - Core protocol feature
3. Sybil Resistance (3 weeks) - Network security
4. Semantic Consensus (3-4 weeks) - High-value settlement security

**Medium Priority (3-6 Months)**:
5. Complete Governance System (4 weeks) - Protocol evolution
6. Multi-Chain Orchestration (3-4 weeks) - Scaling capability
7. Fee Distribution to Delegators (2 weeks) - Economic completeness
8. DPoS Validator Rotation (2 weeks) - Proper DPoS implementation

**Low Priority (6-12 Months)**:
9. WebSocket Real-Time Updates (2 weeks) - Performance optimization
10. Intent Clustering & Batch Mediation (2 weeks) - Efficiency improvement
11. ML-Based Candidate Prioritization (2-3 weeks) - Advanced optimization
12. Distributed Mediator Coordination (3 weeks) - Advanced scaling

**Total Estimated Effort**: 35-40 weeks (with some parallelization possible)

---

## DEVELOPMENT RECOMMENDATIONS

### Critical Path
1. **Test Suite First**: All new features should have comprehensive tests
2. **Core Protocol Completion**: Challenges and semantic consensus are spec-defined
3. **Economic Security**: Sybil resistance and fee distribution critical for mainnet
4. **Governance Before Scale**: Establish governance before multi-chain expansion

### Architecture Improvements
- Abstract chain API client for easier testing and custom integrations
- Implement event-driven architecture for better component decoupling
- Add health check and monitoring endpoints
- Implement proper daemon mode with process management
- Add configuration validation at startup

### Documentation Needs
- API integration guide for chain developers
- Mediator operator handbook
- Governance participation guide
- Security audit and threat model
- Economic analysis and game theory documentation

### Infrastructure Requirements
- Testnet deployment environment
- CI/CD pipeline for automated testing
- Monitoring and alerting system
- Metrics collection and analysis
- Incident response procedures

---

**Document Maintained By**: Claude Code
**Last Updated**: December 19, 2025
**Next Review**: After implementation of top 4 priority features
