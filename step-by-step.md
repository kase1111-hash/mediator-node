Mediator Node Step-by-Step Guide

Prerequisites:

NatLangChain node access (single or multi-chain)

Local LLM configured (Anthropic, Claude, or open-source)

Optional: bonded NLC stake or delegated stake if DPoS is enabled

Optional: PoA authority key if running on a PoA-enabled chain

1. Node Setup

Install Node Software

Pull the latest NatLangChain mediator repo.

Install dependencies: LLM client library, vector DB, blockchain API SDK.

Configure Node Settings

Chain endpoints (REST API or P2P peer addresses)

Consensus mode: permissionless / DPoS / PoA

LLM backend (model path, API key)

Vector database path (for semantic embeddings)

Optional: bonding stake amount or PoA key

Start Node Process

Begin monitoring Pending Intent Pool.

Initialize local reputation and staking counters.

2. Ingestion Phase

Poll for New Entries

Fetch unclosed intent entries from your chain(s).

Filter for open, unaligned contracts or negotiation requests.

Validate Entries

Skip entries flagged as “Unalignable” (coercion, vagueness, or prohibited content).

Maintain local index of active intents.

3. Mapping Phase

Embed Intents

Convert intent prose into vector embeddings for semantic similarity.

Store embeddings in your local vector database.

Identify Alignment Candidates

Compute similarity scores between new entries and existing open intents.

Rank top candidate pairs for negotiation simulation.

4. Negotiation Phase (Internal Simulation)

Run Multi-Turn Dialogue Simulation

Simulate interaction between Party A and Party B’s intents.

Respect explicit constraints, desires, and terms.

Produce Proposed Settlement (PS) Draft

Generate concise reasoning trace for semantic alignment.

Draft proposed terms (price, deliverables, timelines, escrow references).

Include facilitation fee (percentage or fixed) as agreed by protocol defaults.

Attach model integrity hash and, if applicable, bonded/delegated stake or PoA signature.

5. Submission Phase

Publish Proposed Settlement

Post [PROPOSED SETTLEMENT] entry to the chain.

Include all required metadata: intent hashes, reasoning, terms, fee, and signatures.

Monitor Acceptance Window

Default: 72 hours (Permissionless).

Optional: 24 hours for PoA fast finality.

Wait for both parties to submit signed [ACCEPT] entries referencing the PS.

6. Challenge Window (Optional)

Check for Contradictions

Other nodes may submit a Contradiction Proof if the PS violates original intent.

Validate using semantic verification.

If upheld, PS is rejected and fee is forfeited.

7. Closure & Fee Claim

Finalization

If both parties accept and no upheld challenges exist → PS is Closed.

Claim Facilitation Fee

Create [PAYOUT] entry referencing PS hash.

Specify fee amount (percentage/fixed) and payment method (off-chain or escrow).

On DPoS chains: distribute a portion to delegated stakers.

On Permissionless chains: fee goes solely to the Mediator node.

8. Reputation Update

Update Mediator Reputation

Increase weight for successful closures.

Adjust counters for failed or upheld challenges.

Update local and chain-wide reputation index.

9. Continuous Operation

Return to Ingestion Phase and repeat.

Optional: periodically unbond stake, rotate PoA key, or participate in governance votes.

Maintain vector database and memory cache for semantic alignment efficiency.

✅ Notes & Best Practices

Refusal to Mediate: Always enforce procedural integrity — don’t attempt to mediate unsafe, vague, or prohibited intents.

Fee Prioritization: Handle higher-fee settlements first to optimize returns.

Integrity Hashing: Record LLM version and prompt template for reproducibility and accountability.

Sybil Protection: Respect daily posting limits; avoid mediating spam entries.

This workflow ensures a Mediator Node can mine value through alignment mediation, earn facilitation fees, and remain fully compliant with NatLangChain’s Lawful Use & Non-Surveillance Guarantee.
