Mediator Protocol Specification — MP-01
NatLangChain Mediator Node Protocol (Draft — December 18, 2025)
1. Overview
The Mediator Protocol (MP-01) defines how independent Mediator Nodes discover, negotiate, and propose alignments between explicit intents posted on NatLangChain.
Unlike traditional proof-of-work or proof-of-stake, consensus and reward are earned through Proof-of-Alignment — verifiable, value-creating mediation performed by LLMs.
Mediator Nodes are fully optional and standalone. Anyone may run one to earn facilitation fees without ever posting, buying, or selling intents.
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





























ComponentPurposeIntent HashesUnique block/entry hashes of Party A and Party B’s original intents.Reasoning TraceConcise, human-readable explanation of the semantic alignment (why these intents match).Proposed TermsExplicit closure conditions (price, deliverables, timelines, escrow references, etc.).Facilitation FeePercentage or fixed amount claimed by the Mediator upon closure (as specified or default).Model Integrity HashCryptographic proof of the LLM version and prompt template used (ensures neutrality and reproducibility).
Example prose prefix:
[PROPOSED SETTLEMENT] Linking Intent #abc123 (Party A) and #def456 (Party B). Reasoning: … Proposed Terms: … Fee: 1% to Mediator node_7f3a…
4. Proof-of-Alignment (Consensus & Finality)
Settlements become final through a layered verification process:

Mutual Acceptance (Fast Path)
If both parties submit signed “Accept” entries referencing the PS within the acceptance window (default 72 hours), the settlement is Closed. The Mediator may claim their fee.
Challenge Window
During the acceptance window, any node may submit a Contradiction Proof (prose + LLM paraphrase showing violation of original intent). If validated by consensus, the original Mediator’s claim is forfeited.
Semantic Consensus (High-Value Option)
For settlements above a configurable threshold, closure requires independent confirmation: at least 3 of 5 randomly selected Mediator Nodes must produce semantically equivalent summaries of the agreement.

5. Mediator Node Requirements
A compliant Mediator Node must provide:

Contextual Memory
Local vector store containing at least the last 10,000 unclosed intents (for accurate mapping).
Intent Parser
Specialized prompting or fine-tuned model capable of extracting:
– Desires (what the party wants)
– Constraints (non-negotiable boundaries)
Fee Prioritization
Nodes naturally prioritize pairs offering higher facilitation fees or faster closure probability.
Supported LLM Backends
Configurable (Anthropic, Grok, Ollama, etc.) with mandatory integrity hashing of model version and system prompt.

6. Refusal to Mediate (Procedural Integrity)
Mediators must evaluate every intent against the Lawful Use Guarantee.

If an intent contains coercion, deliberate vagueness, euphemism, or unsafe parameters, the Mediator generates an internal “Unalignable” flag.
After N independent Mediators (default N=5) mark an intent Unalignable, it is moved to an archived state and excluded from future mapping.
No entry is deleted; it simply ceases to be eligible for mediated alignment.

This prevents low-quality or harmful “slop” from degrading the network while preserving free expression.
7. Anti-Spam & Posting Limits (Sybil Resistance)
To prevent flooding without introducing upfront fees:

Daily Free Posting Limit
Each unique identity (cryptographic keypair) may submit up to 3 new intents per 24-hour period at no cost.
Excess Posting Charge
The 4th and subsequent intents in a 24-hour window require a small anti-spam deposit (e.g., 0.0001 ETH or equivalent) held in escrow and refunded after 30 days if no successful spam challenges occur.
Challenge-Based Refund Forfeiture
If an intent is later proven to be spam or violates procedural integrity, the deposit is burned or redistributed to challengers.

This design favors genuine users while lightly discouraging bots — no barrier for normal activity, but exponential cost for abuse.
8. Example Flow: Daily Commit Alignment

Party A (developer):
Posts daily work summary with terms: “Rust encryption optimization — 20% faster. License for $500 or trade for UI work.”
Party B (app builder):
Posts: “Seeking high-performance encryption module. Budget $400–600.”
Mediator Node detects 92% semantic alignment, simulates negotiation, proposes $500 transfer via referenced escrow.
Both parties accept → settlement closes → Mediator claims 1% ($5).
Full receipt chain remains publicly auditable forever.

9. References

NatLangChain Core Repository
Lawful Use & Non-Surveillance Guarantee
Standalone Mediator Node Implementation: kase1111-hash/mediator-node (forthcoming)

This specification is deliberately evolutive. Future versions may add staking, reputation weighting, or cross-chain mediation.
— kase1111-hash
December 18, 2025
