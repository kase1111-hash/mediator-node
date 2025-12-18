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
