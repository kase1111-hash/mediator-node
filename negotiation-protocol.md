MP-01 — Negotiation & Ratification Protocol
NatLangChain Mediator Specification (Standalone)

Status: Draft (Normative)

1. Purpose

MP-01 defines the protocol by which negotiations are mediated on NatLangChain using Large Language Models (LLMs) without delegating authority over agreement, value, or commitment.

The protocol enforces a strict boundary:

LLMs may propose. Humans must ratify.

MP-01 exists to ensure that all agreements recorded on the ledger are the result of explicit, auditable human intent, even when assisted by advanced models.

2. Design Principles

Human Sovereignty — No agreement is valid without explicit human ratification.

Legibility Over Speed — Clarity and auditability take precedence over optimization.

Asymmetry by Design — Models explore possibility; humans commit.

No Silent Consent — Absence of response is never treated as agreement.

Provenance First — Every proposal must disclose its origin.

3. Actors
3.1 Human Parties

Individuals or institutions expressing intent, constraints, and commitments in natural language.

3.2 Mediator

An LLM-powered agent responsible for:

Clarifying intent

Proposing settlements

Surfacing conflicts and ambiguities

The Mediator has no authority to decide outcomes.

3.3 Ledger

An append-only system that records:

Proposed settlements

Ratification statements

Final agreement state

4. Negotiation Lifecycle
Phase 1 — Intent Expression

Humans submit prose statements describing:

Goals

Constraints

Non-negotiables

Context

All inputs are time-stamped and preserved.

Phase 2 — Mediation

The Mediator MAY:

Rephrase intent for clarity or neutrality

Propose alternative formulations

Identify hidden conflicts or assumptions

Simulate downstream interpretations

Generate multiple settlement options

The Mediator MUST:

Preserve detected intent

Mark all outputs as non-binding

Provide rationale for proposals

The Mediator MUST NOT:

Assert that agreement has been reached

Imply consent from conversational patterns

Introduce its own value hierarchy

Phase 3 — Proposed Settlement

The Mediator emits a Proposed Settlement containing:

Clear terms

Referenced intents

Explicit trade-offs

Provenance metadata

All Proposed Settlements are explicitly labeled PROVISIONAL.

Phase 4 — Ratification

Each human party is prompted individually:

“Do you ratify this settlement as the final record of your agreement? Respond in your own words.”

Valid ratification requires:

Unambiguous affirmative language

Reference to the settlement as written

Natural-language expression

Examples of valid ratification:

“I accept this settlement as written.”

“I ratify the agreement dated [timestamp].”

Examples of non-ratification:

Silence or timeout

Ambiguous phrasing

Conditional or probabilistic language

Phase 5 — Resolution

Mutual Ratification → Settlement becomes ledger-canonical

Rejection or Counter → Return to Mediation

Exit → Negotiation terminated and recorded

No automatic transitions are permitted.

5. Proof-of-Alignment

An agreement is considered valid only when:

All parties have ratified explicitly

Ratifications are time-stamped

The settlement text is immutable

Probabilistic confidence or inferred intent is insufficient.

6. Failure and Dispute Handling

The protocol explicitly records:

Partial ratifications

Withdrawals

Model disagreement

Ambiguity or deadlock

Disputes may trigger:

Re-mediation

Human arbitration

External legal processes

MP-01 does not resolve disputes; it preserves evidence.

7. Security and Abuse Considerations

Mediator outputs must be attributable and inspectable

Prompt manipulation attempts are logged

Coercive or deceptive ratification language may be flagged

Agents acting on behalf of humans must disclose delegation
