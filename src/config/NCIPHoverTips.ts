/**
 * NCIP Hover Tips Configuration
 *
 * Provides descriptive hover tips for all NCIP (NatLangChain Improvement Proposal) fields.
 * These tips help users understand the governance framework and semantic concepts.
 *
 * @see docs/NCIP-000+.md for the consolidated NCIP index
 */

export interface NCIPHoverTip {
  /** The field or concept name */
  field: string;
  /** Short description for tooltip display */
  shortDescription: string;
  /** Detailed description for expanded help */
  longDescription: string;
  /** Which NCIP defines this concept */
  definedIn: string;
  /** Related concepts */
  relatedConcepts?: string[];
  /** Whether this is a core/protocol-bound/extension term */
  termClass?: 'core' | 'protocol-bound' | 'extension';
}

export interface NCIPHoverTipsConfig {
  /** Master switch to enable/disable all hover tips */
  enabled: boolean;
  /** Show short descriptions only (disable long descriptions) */
  shortDescriptionsOnly: boolean;
  /** Show NCIP reference links */
  showNCIPReferences: boolean;
  /** Show related concepts */
  showRelatedConcepts: boolean;
  /** Delay before showing tooltip (ms) */
  hoverDelayMs: number;
}

/**
 * Default configuration for NCIP hover tips
 */
export const defaultNCIPHoverTipsConfig: NCIPHoverTipsConfig = {
  enabled: true,
  shortDescriptionsOnly: false,
  showNCIPReferences: true,
  showRelatedConcepts: true,
  hoverDelayMs: 300,
};

/**
 * Comprehensive hover tips for all NCIP fields and concepts
 */
export const ncipHoverTips: Record<string, NCIPHoverTip> = {
  // ============================================================================
  // NCIP-000: Terminology & Semantics Governance
  // ============================================================================

  'ncip': {
    field: 'NCIP',
    shortDescription: 'NatLangChain Improvement Proposal - a governance document for protocol changes',
    longDescription: 'A NatLangChain Improvement Proposal (NCIP) is a formal governance document that defines how terminology, semantics, and protocol behavior evolve within the NatLangChain ecosystem. NCIPs ensure changes are traceable, human-ratified, and prevent semantic drift.',
    definedIn: 'NCIP-000',
    relatedConcepts: ['Semantic Drift', 'Canonical Term', 'Protocol Amendment'],
    termClass: 'core',
  },

  'terminology_governance': {
    field: 'Terminology Governance',
    shortDescription: 'Framework for managing how protocol terms evolve without semantic drift',
    longDescription: 'Terminology Governance establishes the rules for how canonical terms are defined, clarified, and evolved within NatLangChain. It ensures that meaning remains stable and traceable across protocol versions while allowing necessary evolution through formal processes.',
    definedIn: 'NCIP-000',
    relatedConcepts: ['Canonical Term Registry', 'Semantic Drift'],
    termClass: 'core',
  },

  // ============================================================================
  // NCIP-001: Canonical Term Registry
  // ============================================================================

  'canonical_term': {
    field: 'Canonical Term',
    shortDescription: 'An officially defined term in the NatLangChain protocol',
    longDescription: 'A Canonical Term is a machine-readable, officially defined term in the NatLangChain Canonical Term Registry. Each term has a precise definition, governance rules, and may have synonyms. Canonical terms eliminate ambiguity and enable automated validation.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Term Class', 'Semantic Drift'],
    termClass: 'core',
  },

  'term_class': {
    field: 'Term Class',
    shortDescription: 'Classification of a canonical term (core, protocol-bound, or extension)',
    longDescription: 'Each canonical term must declare exactly one class: "core" (immutable, consensus-critical), "protocol-bound" (governed by a Mediator Protocol), or "extension" (optional or experimental). The class determines governance rules and mutability.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Canonical Term', 'Governance'],
    termClass: 'core',
  },

  'intent': {
    field: 'Intent',
    shortDescription: 'A human-authored expression of desired outcome or commitment',
    longDescription: 'An Intent is the primary semantic input to NatLangChain - a human-authored expression of desired outcome or commitment recorded as prose. Intent is not executable by itself; execution is always derived. Intents form the basis of all agreements and negotiations.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Agreement', 'Ratification', 'Proof of Understanding'],
    termClass: 'core',
  },

  'entry': {
    field: 'Entry',
    shortDescription: 'A discrete, timestamped record in the NatLangChain system',
    longDescription: 'An Entry is a discrete, timestamped record containing prose, metadata, and signatures within the NatLangChain system. Entries form the canonical audit trail and are immutable once recorded.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Intent', 'Agreement', 'Temporal Fixity'],
    termClass: 'core',
  },

  'agreement': {
    field: 'Agreement',
    shortDescription: 'A mutually ratified Intent establishing shared understanding between parties',
    longDescription: 'An Agreement is a mutually ratified Intent or set of Intents establishing shared understanding and obligations between parties. Agreement does not imply automation or smart contract execution - it represents human consensus on meaning and obligations.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Intent', 'Ratification', 'Settlement'],
    termClass: 'core',
  },

  'ratification': {
    field: 'Ratification',
    shortDescription: 'Explicit consent confirming understanding and acceptance',
    longDescription: 'Ratification is an explicit act of consent confirming understanding and acceptance of an Intent or Agreement. It requires human authorship and creates a binding commitment that waives future claims of misunderstanding.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Agreement', 'Proof of Understanding', 'Human Authorship'],
    termClass: 'core',
  },

  'mediator': {
    field: 'Mediator',
    shortDescription: 'An entity responsible for interpretation and dispute resolution',
    longDescription: 'A Mediator is a human or authorized entity responsible for interpretation, dispute resolution, or enforcement within defined bounds. Mediators propose but never decide - humans retain final authority. Mediator reputation is tracked and affects proposal visibility.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Dispute', 'Mediator Reputation', 'Validator'],
    termClass: 'core',
  },

  // ============================================================================
  // NCIP-002: Semantic Drift Thresholds & Validator Responses
  // ============================================================================

  'semantic_drift': {
    field: 'Semantic Drift',
    shortDescription: 'Divergence between original intended meaning and current interpretation',
    longDescription: 'Semantic Drift is the measurable divergence between the canonical meaning of a term or Intent at time T₀ and its current interpretation or derived execution. Drift is scored from 0.0 (identical) to 1.0 (unrelated/contradictory) and triggers mandatory validator responses at defined thresholds.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Drift Score', 'Drift Threshold', 'Temporal Fixity'],
    termClass: 'core',
  },

  'drift_score': {
    field: 'Drift Score',
    shortDescription: 'A 0.0-1.0 value measuring semantic divergence',
    longDescription: 'A Drift Score is a normalized value between 0.0 and 1.0 representing semantic divergence from canonical meaning. 0.0 indicates identical meaning, 1.0 indicates unrelated or contradictory meaning. The score determines which drift level (D0-D4) applies and what validator response is required.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Semantic Drift', 'Drift Threshold'],
    termClass: 'core',
  },

  'drift_threshold_d0': {
    field: 'D0 - Stable',
    shortDescription: 'Drift score 0.00-0.10: Meaning preserved, proceed normally',
    longDescription: 'D0 (Stable) applies when drift score is 0.00-0.10. The meaning is preserved. Validators proceed normally with no logging required. This is the ideal state for all semantic operations.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Drift Score', 'Semantic Drift'],
    termClass: 'protocol-bound',
  },

  'drift_threshold_d1': {
    field: 'D1 - Soft Drift',
    shortDescription: 'Drift score 0.10-0.25: Minor variation, proceed with warning',
    longDescription: 'D1 (Soft Drift) applies when drift score is 0.10-0.25. This indicates minor lexical or stylistic variation. Validators proceed but emit a non-fatal warning and record the occurrence for trend analysis.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Drift Score', 'Semantic Drift'],
    termClass: 'protocol-bound',
  },

  'drift_threshold_d2': {
    field: 'D2 - Ambiguous Drift',
    shortDescription: 'Drift score 0.25-0.45: Execution risk, clarification required',
    longDescription: 'D2 (Ambiguous Drift) applies when drift score is 0.25-0.45. There is meaning overlap but execution risk exists. Validators must pause derived execution, emit a clarification request, and log to the Uncertainty Log. LLM agents must ask clarifying questions and avoid speculative completion.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Drift Score', 'Clarification', 'Proof of Understanding'],
    termClass: 'protocol-bound',
  },

  'drift_threshold_d3': {
    field: 'D3 - Hard Drift',
    shortDescription: 'Drift score 0.45-0.70: Substantive deviation, human ratification required',
    longDescription: 'D3 (Hard Drift) applies when drift score is 0.45-0.70. This indicates substantive semantic deviation. Validators must reject derived execution, require explicit human ratification, and flag for mediator review. This triggers a 24-hour cooling period if a dispute is initiated.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Drift Score', 'Human Ratification', 'Cooling Period'],
    termClass: 'protocol-bound',
  },

  'drift_threshold_d4': {
    field: 'D4 - Semantic Break',
    shortDescription: 'Drift score 0.70-1.00: Meaning no longer aligned, escalate to dispute',
    longDescription: 'D4 (Semantic Break) applies when drift score is 0.70-1.00. The meaning is no longer aligned with the original. Validators must reject, invalidate the current interpretation, escalate to Dispute or NCIP process, and prevent auto-retry. This triggers a 72-hour cooling period and cannot be overridden without formal dispute resolution.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Drift Score', 'Dispute', 'Semantic Lock'],
    termClass: 'protocol-bound',
  },

  'temporal_fixity': {
    field: 'Temporal Fixity',
    shortDescription: 'Binding of meaning to a specific point in time (T₀)',
    longDescription: 'Temporal Fixity is the binding of meaning to a specific point in time (T₀), ensuring interpretations are evaluated against contemporaneous context. Validators must not reinterpret older contracts using newer semantics without explicit upgrade. This prevents retroactive reinterpretation attacks.',
    definedIn: 'NCIP-002',
    relatedConcepts: ['Semantic Lock', 'Canonical Term Registry'],
    termClass: 'core',
  },

  // ============================================================================
  // NCIP-003: Multilingual Semantic Alignment & Drift (Referenced)
  // ============================================================================

  'csal': {
    field: 'CSAL (Canonical Semantic Anchor Language)',
    shortDescription: 'The authoritative language for canonical meaning',
    longDescription: 'The Canonical Semantic Anchor Language (CSAL) is the designated language for authoritative meaning in NatLangChain. Translations to other languages must preserve semantic equivalence and are subject to drift scoring. CSAL ensures consistent interpretation across languages.',
    definedIn: 'NCIP-003',
    relatedConcepts: ['Semantic Drift', 'Translation', 'Anchor Language'],
    termClass: 'core',
  },

  'multilingual_drift': {
    field: 'Multilingual Drift',
    shortDescription: 'Semantic divergence introduced through translation',
    longDescription: 'Multilingual Drift occurs when translation between languages introduces semantic divergence from the CSAL meaning. This is measured using the same drift thresholds (D0-D4) and may trigger additional validation requirements including anchor language verification.',
    definedIn: 'NCIP-003',
    relatedConcepts: ['CSAL', 'Semantic Drift', 'Drift Threshold'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-004: Proof of Understanding (PoU) Generation & Verification
  // ============================================================================

  'proof_of_understanding': {
    field: 'Proof of Understanding (PoU)',
    shortDescription: 'Evidence demonstrating comprehension of meaning and implications',
    longDescription: 'Proof of Understanding (PoU) is a required, verifiable artifact demonstrating that a party has read, comprehended, and accepts an Intent or Agreement. PoU is semantic, not merely cryptographic - it must include a summary in own words, key obligations, rights, consequences, and explicit acceptance. Verified PoU binds interpretation and waives future misunderstanding claims.',
    definedIn: 'NCIP-004',
    relatedConcepts: ['Ratification', 'Intent', 'Agreement'],
    termClass: 'core',
  },

  'pou_coverage': {
    field: 'PoU Coverage Score',
    shortDescription: 'Measure of whether all material clauses are addressed',
    longDescription: 'Coverage Score measures whether a Proof of Understanding addresses all material clauses of the Intent or Agreement. A score of 1.0 means all clauses are covered; scores below 0.90 require resubmission or escalation.',
    definedIn: 'NCIP-004',
    relatedConcepts: ['Proof of Understanding', 'PoU Fidelity'],
    termClass: 'protocol-bound',
  },

  'pou_fidelity': {
    field: 'PoU Fidelity Score',
    shortDescription: 'Measure of whether meaning matches canonical intent',
    longDescription: 'Fidelity Score measures whether the meaning expressed in a Proof of Understanding matches the canonical intent of the original Agreement. High fidelity indicates accurate comprehension; low fidelity suggests misunderstanding.',
    definedIn: 'NCIP-004',
    relatedConcepts: ['Proof of Understanding', 'PoU Coverage'],
    termClass: 'protocol-bound',
  },

  'pou_consistency': {
    field: 'PoU Consistency Score',
    shortDescription: 'Measure of internal consistency (no contradictions)',
    longDescription: 'Consistency Score measures whether a Proof of Understanding is internally consistent with no contradictions. Contradictory statements in a PoU indicate confusion and require clarification before acceptance.',
    definedIn: 'NCIP-004',
    relatedConcepts: ['Proof of Understanding'],
    termClass: 'protocol-bound',
  },

  'pou_completeness': {
    field: 'PoU Completeness Score',
    shortDescription: 'Measure of whether obligations and consequences are acknowledged',
    longDescription: 'Completeness Score measures whether a Proof of Understanding acknowledges all obligations and consequences. A complete PoU demonstrates the signer understands what they must do and what happens if they fail.',
    definedIn: 'NCIP-004',
    relatedConcepts: ['Proof of Understanding'],
    termClass: 'protocol-bound',
  },

  'semantic_fingerprint': {
    field: 'Semantic Fingerprint',
    shortDescription: 'LLM-generated embedding hash for semantic comparison',
    longDescription: 'A Semantic Fingerprint is an LLM-generated embedding hash that captures the semantic meaning of a PoU or Agreement. It enables efficient semantic comparison and drift detection without re-processing the full text.',
    definedIn: 'NCIP-004',
    relatedConcepts: ['Proof of Understanding', 'Semantic Drift'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-005: Dispute Escalation, Cooling Periods & Semantic Locking
  // ============================================================================

  'dispute': {
    field: 'Dispute',
    shortDescription: 'A formal challenge asserting misinterpretation or non-compliance',
    longDescription: 'A Dispute is a formally raised challenge asserting misinterpretation, non-compliance, or unresolved ambiguity in an Agreement. Disputes halt all derived execution, activate Semantic Lock, and begin a mandatory cooling period before escalation.',
    definedIn: 'NCIP-005',
    relatedConcepts: ['Semantic Lock', 'Cooling Period', 'Escalation'],
    termClass: 'protocol-bound',
  },

  'semantic_lock': {
    field: 'Semantic Lock',
    shortDescription: 'Binding freeze of meaning at a specific time during disputes',
    longDescription: 'A Semantic Lock is a binding freeze of interpretive meaning at a specific time (Tₗ), against which all dispute evaluation occurs. During a lock: no contract amendments, no re-translation, no registry upgrades, and no PoU regeneration. All interpretation references the Tₗ state only.',
    definedIn: 'NCIP-005',
    relatedConcepts: ['Dispute', 'Temporal Fixity', 'Cooling Period'],
    termClass: 'protocol-bound',
  },

  'cooling_period': {
    field: 'Cooling Period',
    shortDescription: 'Mandatory delay before dispute escalation (24h for D3, 72h for D4)',
    longDescription: 'A Cooling Period is a mandatory delay interval preventing immediate escalation, allowing clarification or settlement without adversarial processes. D3 disputes have 24-hour cooling; D4 disputes have 72-hour cooling. During cooling, clarification and settlement proposals are allowed, but escalation and enforcement are forbidden.',
    definedIn: 'NCIP-005',
    relatedConcepts: ['Dispute', 'Escalation', 'Semantic Lock'],
    termClass: 'protocol-bound',
  },

  'escalation_path': {
    field: 'Escalation Path',
    shortDescription: 'Deterministic sequence: settlement → mediator → adjudication → resolution',
    longDescription: 'The Escalation Path is the deterministic sequence for dispute resolution: (1) Mutual Settlement Attempt, (2) Mediator Review, (3) Formal Adjudication, (4) Binding Resolution. Each step requires explicit transition; skipping steps is prohibited.',
    definedIn: 'NCIP-005',
    relatedConcepts: ['Dispute', 'Mediator', 'Resolution'],
    termClass: 'protocol-bound',
  },

  'dispute_resolution': {
    field: 'Dispute Resolution',
    shortDescription: 'Final outcome: dismissed, clarified, amended, terminated, or compensated',
    longDescription: 'Dispute Resolution is the final outcome of a dispute process. Outcomes include: Dismissed (execution resumes), Clarified (semantic lock updated + re-ratified), Amended (new prose contract required), Terminated (agreement voided), or Compensated (settlement enforced). All outcomes are final and logged.',
    definedIn: 'NCIP-005',
    relatedConcepts: ['Dispute', 'Escalation Path', 'Settlement'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-006: Jurisdictional Interpretation & Legal Bridging (Referenced)
  // ============================================================================

  'jurisdictional_interpretation': {
    field: 'Jurisdictional Interpretation',
    shortDescription: 'How NatLangChain interfaces with external legal jurisdictions',
    longDescription: 'Jurisdictional Interpretation defines how NatLangChain interfaces with external legal jurisdictions while preserving canonical meaning and temporal fixity. It bridges protocol semantics with real-world legal requirements without allowing legal systems to override canonical definitions.',
    definedIn: 'NCIP-006',
    relatedConcepts: ['Canonical Term', 'Temporal Fixity', 'Legal Bridging'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-007: Validator Trust Scoring & Reliability Weighting
  // ============================================================================

  'validator': {
    field: 'Validator',
    shortDescription: 'An entity that validates semantic operations (LLM, hybrid, symbolic, or human)',
    longDescription: 'A Validator is an entity (LLM, hybrid, symbolic, or human-operated) that validates semantic operations in NatLangChain. Validators never decide outcomes alone and never override Semantic Locks. Trust affects how much their signal counts, not what they can do.',
    definedIn: 'NCIP-007',
    relatedConcepts: ['Validator Trust Score', 'Consensus', 'Mediator'],
    termClass: 'core',
  },

  'validator_trust_score': {
    field: 'Validator Trust Score',
    shortDescription: 'Scoped reliability measure affecting validator weight in consensus',
    longDescription: 'Validator Trust Score is a scoped reliability measure for each validator, affecting their weight in consensus and dispute analysis. Trust is scoped (semantic parsing, drift detection, PoU generation, etc.) - a validator may be trusted in one scope and weak in another. Trust increases through consensus matches and correct predictions; it decays through overruling and unauthorized interpretations.',
    definedIn: 'NCIP-007',
    relatedConcepts: ['Validator', 'Effective Weight', 'Consensus'],
    termClass: 'protocol-bound',
  },

  'effective_weight': {
    field: 'Effective Weight',
    shortDescription: 'Validator contribution weight = base_weight × trust_score × scope_modifier',
    longDescription: 'Effective Weight determines how much a validator\'s signal counts in consensus. It is calculated as: effective_weight = base_weight × trust_score × scope_modifier. Base weight is protocol-defined by validator type; trust_score is 0-1; scope_modifier reflects task relevance. Maximum effective weight is capped to prevent any single validator from dominating.',
    definedIn: 'NCIP-007',
    relatedConcepts: ['Validator Trust Score', 'Consensus'],
    termClass: 'protocol-bound',
  },

  'trust_decay': {
    field: 'Trust Decay',
    shortDescription: 'Temporal decay of validator trust without activity',
    longDescription: 'Trust Decay is the temporal decay of validator trust over time without activity, following the formula: score_t = score_0 × e^(−λΔt). This prevents dormant validators from retaining legacy authority and ensures stale model versions don\'t dominate consensus.',
    definedIn: 'NCIP-007',
    relatedConcepts: ['Validator Trust Score', 'Trust Recovery'],
    termClass: 'protocol-bound',
  },

  'validator_diversity': {
    field: 'Validator Diversity Threshold',
    shortDescription: 'Minimum number of different validators required for consensus',
    longDescription: 'The Validator Diversity Threshold is the minimum number of different validators required to participate in consensus (default: 3). This prevents validator capture and model monoculture dominance. Low-trust minority signals must remain visible even if they don\'t dominate.',
    definedIn: 'NCIP-007',
    relatedConcepts: ['Validator', 'Consensus', 'Anti-Centralization'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-008: Semantic Appeals, Precedent & Case Law Encoding (Referenced)
  // ============================================================================

  'semantic_appeal': {
    field: 'Semantic Appeal',
    shortDescription: 'Challenge to a semantic interpretation that may set precedent',
    longDescription: 'A Semantic Appeal is a formal challenge to a semantic interpretation under NCIP-008. Successful appeals create Semantic Case Records (SCRs) that serve as advisory (non-binding) precedent for future interpretations. Appeals affect mediator reputation and may trigger slashing.',
    definedIn: 'NCIP-008',
    relatedConcepts: ['Semantic Case Record', 'Precedent', 'Dispute'],
    termClass: 'protocol-bound',
  },

  'semantic_case_record': {
    field: 'Semantic Case Record (SCR)',
    shortDescription: 'Advisory precedent from resolved semantic disputes',
    longDescription: 'A Semantic Case Record (SCR) is created from successful semantic appeals and serves as advisory (non-binding) precedent for future interpretations. SCRs help validators and mediators make consistent decisions across similar cases.',
    definedIn: 'NCIP-008',
    relatedConcepts: ['Semantic Appeal', 'Precedent'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-009: Regulatory Interface Modules & Compliance Proofs (Referenced)
  // ============================================================================

  'compliance_proof': {
    field: 'Compliance Proof',
    shortDescription: 'Cryptographic proof of regulatory compliance without exposing private data',
    longDescription: 'A Compliance Proof is a cryptographic proof that NatLangChain operations comply with external regulations (SEC 17a-4, GDPR, HIPAA, SOX) without exposing private data. These proofs enable regulatory interface while maintaining data privacy.',
    definedIn: 'NCIP-009',
    relatedConcepts: ['Jurisdictional Interpretation', 'Privacy'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-010: Mediator Reputation, Slashing & Market Dynamics
  // ============================================================================

  'mediator_reputation': {
    field: 'Mediator Reputation',
    shortDescription: 'Market-based trust measure affecting proposal visibility and selection',
    longDescription: 'Mediator Reputation is a multi-dimensional trust measure (acceptance rate, semantic accuracy, appeal survival, dispute avoidance, coercion signal, latency discipline) that affects proposal visibility, validator weighting, and market selection probability. Reputation is earned only through on-chain behavior.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Composite Trust Score', 'Slashing', 'Reputation Bond'],
    termClass: 'protocol-bound',
  },

  'composite_trust_score': {
    field: 'Composite Trust Score (CTS)',
    shortDescription: 'Weighted combination of mediator reputation dimensions',
    longDescription: 'The Composite Trust Score (CTS) combines weighted reputation dimensions: CTS = w1·AR + w2·SA + w3·AS + w4·DA − w5·CS − w6·Late. CTS affects proposal ranking, validator attention, and eligibility for high-value disputes. Weights may evolve via NCIP-008 precedent.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Mediator Reputation', 'Acceptance Rate', 'Semantic Accuracy'],
    termClass: 'protocol-bound',
  },

  'reputation_bond': {
    field: 'Reputation Bond',
    shortDescription: 'Stake required for mediator registration, subject to slashing',
    longDescription: 'A Reputation Bond is the stake that mediators must post to register and submit proposals. Unbonded mediators may observe but may not submit proposals. The bond is subject to slashing for semantic manipulation, repeated invalid proposals, coercive framing, appeal reversals, and collusion.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Slashing', 'Mediator Registration'],
    termClass: 'protocol-bound',
  },

  'slashing': {
    field: 'Slashing',
    shortDescription: 'Automatic, deterministic penalty for mediator misconduct',
    longDescription: 'Slashing is an automatic, deterministic, and non-discretionary penalty applied to mediator bonds for misconduct. Slashable offenses include: semantic manipulation (D4 drift, 10-30%), repeated invalid proposals (5-15%), coercive framing (15%), appeal reversal (5-20%), and collusion signals (progressive). Slashed funds flow to treasury and affected parties.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Reputation Bond', 'Mediator Reputation', 'Cooldown'],
    termClass: 'protocol-bound',
  },

  'mediator_cooldown': {
    field: 'Mediator Cooldown',
    shortDescription: 'Temporary restrictions after slashing (reduced proposals, visibility)',
    longDescription: 'After slashing, mediators face cooldown periods with temporary restrictions: reduced proposal caps, reduced visibility weighting, and mandatory waiting periods before full participation resumes. This prevents immediate reputation recovery after misconduct.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Slashing', 'Mediator Reputation'],
    termClass: 'protocol-bound',
  },

  'acceptance_rate': {
    field: 'Acceptance Rate (AR)',
    shortDescription: 'Percentage of mediator proposals ratified by both parties',
    longDescription: 'Acceptance Rate (AR) is the percentage of a mediator\'s proposals that are ratified by both parties. High acceptance rates indicate effective mediation that produces mutually agreeable outcomes.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Composite Trust Score', 'Mediator Reputation'],
    termClass: 'protocol-bound',
  },

  'semantic_accuracy': {
    field: 'Semantic Accuracy (SA)',
    shortDescription: 'Validator-measured drift score for mediator proposals',
    longDescription: 'Semantic Accuracy (SA) measures how well a mediator\'s proposals align with canonical semantics, as measured by validators. High semantic accuracy indicates the mediator produces proposals with low drift scores.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Composite Trust Score', 'Semantic Drift'],
    termClass: 'protocol-bound',
  },

  'appeal_survival': {
    field: 'Appeal Survival (AS)',
    shortDescription: 'Percentage of mediator decisions surviving NCIP-008 appeals',
    longDescription: 'Appeal Survival (AS) measures the percentage of a mediator\'s decisions that survive semantic appeals under NCIP-008. High appeal survival indicates the mediator\'s interpretations are robust and align with precedent.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Composite Trust Score', 'Semantic Appeal'],
    termClass: 'protocol-bound',
  },

  'dispute_avoidance': {
    field: 'Dispute Avoidance (DA)',
    shortDescription: 'Low downstream dispute frequency from mediator proposals',
    longDescription: 'Dispute Avoidance (DA) measures how often a mediator\'s proposals lead to downstream disputes. High dispute avoidance indicates the mediator produces clear, unambiguous proposals that parties understand and accept.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Composite Trust Score', 'Dispute'],
    termClass: 'protocol-bound',
  },

  'coercion_signal': {
    field: 'Coercion Signal (CS)',
    shortDescription: 'Penalty metric for pressure tactics in mediation',
    longDescription: 'Coercion Signal (CS) is a penalty metric that detects and penalizes pressure tactics, manipulation, or coercive framing in mediator proposals. High coercion signals reduce the Composite Trust Score and may trigger slashing.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Composite Trust Score', 'Slashing'],
    termClass: 'protocol-bound',
  },

  'latency_discipline': {
    field: 'Latency Discipline (LD)',
    shortDescription: 'Responsiveness within protocol windows',
    longDescription: 'Latency Discipline (LD) measures a mediator\'s responsiveness within protocol-defined time windows. High latency discipline indicates the mediator responds promptly to requests and meets deadlines.',
    definedIn: 'NCIP-010',
    relatedConcepts: ['Composite Trust Score'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-011: Validator-Mediator Interaction & Weight Coupling (Referenced)
  // ============================================================================

  'weight_coupling': {
    field: 'Weight Coupling',
    shortDescription: 'How validator authority and mediator influence are mutually constrained',
    longDescription: 'Weight Coupling defines how validator authority and mediator influence are coupled and mutually constrained. The relationship is orthogonal, not hierarchical - validators and mediators check each other without one dominating.',
    definedIn: 'NCIP-011',
    relatedConcepts: ['Validator Trust Score', 'Mediator Reputation'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-012: Human Ratification UX & Cognitive Load Limits
  // ============================================================================

  'cognitive_load_budget': {
    field: 'Cognitive Load Budget (CLB)',
    shortDescription: 'Maximum information complexity for human ratification flows',
    longDescription: 'The Cognitive Load Budget (CLB) defines mandatory limits on information complexity in ratification flows. This ensures humans can genuinely understand what they\'re agreeing to, preventing consent obtained through information overload.',
    definedIn: 'NCIP-012',
    relatedConcepts: ['Human Ratification', 'PoU Gates', 'Accessibility'],
    termClass: 'protocol-bound',
  },

  'pou_gate': {
    field: 'PoU Gate',
    shortDescription: 'Checkpoint requiring Proof of Understanding before proceeding',
    longDescription: 'A PoU Gate is a mandatory checkpoint in ratification flows where humans must demonstrate Proof of Understanding before proceeding. This prevents "click-through" consent and ensures genuine comprehension.',
    definedIn: 'NCIP-012',
    relatedConcepts: ['Proof of Understanding', 'Cognitive Load Budget'],
    termClass: 'protocol-bound',
  },

  'anti_fatigue_protection': {
    field: 'Anti-Fatigue Protection',
    shortDescription: 'Limits preventing consent obtained through exhaustion',
    longDescription: 'Anti-Fatigue Protection includes UX constraints that prevent consent obtained through decision fatigue - session limits, mandatory breaks, and complexity throttling ensure humans remain capable of genuine informed consent.',
    definedIn: 'NCIP-012',
    relatedConcepts: ['Cognitive Load Budget', 'Human Ratification'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-013: Emergency Overrides, Force Majeure & Semantic Fallbacks
  // ============================================================================

  'emergency_override': {
    field: 'Emergency Override',
    shortDescription: 'Protocol behavior during emergencies while preserving canonical meaning',
    longDescription: 'Emergency Overrides define how the protocol behaves during emergencies (natural disasters, war, infrastructure collapse) while preserving canonical meaning. Overrides may suspend certain operations but cannot alter historical meaning or bypass core semantic protections.',
    definedIn: 'NCIP-013',
    relatedConcepts: ['Force Majeure', 'Semantic Fallback'],
    termClass: 'protocol-bound',
  },

  'semantic_fallback': {
    field: 'Semantic Fallback',
    shortDescription: 'Degraded-mode operations when full semantic processing is unavailable',
    longDescription: 'Semantic Fallbacks define degraded-mode operations when full semantic processing is unavailable. Fallbacks preserve core safety properties while allowing limited operations during emergencies or system failures.',
    definedIn: 'NCIP-013',
    relatedConcepts: ['Emergency Override', 'Force Majeure'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-014: Protocol Amendments & Constitutional Change
  // ============================================================================

  'protocol_amendment': {
    field: 'Protocol Amendment',
    shortDescription: 'Formal process for changing NatLangChain itself',
    longDescription: 'A Protocol Amendment is the formal, slow, human-ratified process for changing NatLangChain itself without violating temporal fixity. Amendments require explicit NCIPs, backward compatibility analysis, and human ratification. They cannot alter historical meaning.',
    definedIn: 'NCIP-014',
    relatedConcepts: ['NCIP', 'Constitutional Change', 'Temporal Fixity'],
    termClass: 'protocol-bound',
  },

  'constitutional_change': {
    field: 'Constitutional Change',
    shortDescription: 'Changes to core protocol rules requiring highest-level governance',
    longDescription: 'Constitutional Changes are modifications to core protocol rules that require the highest level of governance scrutiny. NCIP-014 cannot alter historical meaning, NCIP-015 cannot reopen locked semantics, NCIP-006 cannot override canonical definitions, and NCIP-012 cannot simplify meaning beyond PoU guarantees.',
    definedIn: 'NCIP-014',
    relatedConcepts: ['Protocol Amendment', 'NCIP'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // NCIP-015: Sunset Clauses, Archival Finality & Historical Semantics
  // ============================================================================

  'sunset_clause': {
    field: 'Sunset Clause',
    shortDescription: 'Defined end-of-life for agreements and their semantics',
    longDescription: 'A Sunset Clause defines how agreements end and transitions to archival state. It ensures expired meanings are preserved for historical reference without remaining operative. Sunset does not delete - it archives.',
    definedIn: 'NCIP-015',
    relatedConcepts: ['Archival Finality', 'Historical Semantics'],
    termClass: 'protocol-bound',
  },

  'archival_finality': {
    field: 'Archival Finality',
    shortDescription: 'Permanent, immutable preservation of expired agreements',
    longDescription: 'Archival Finality ensures that expired or sunset agreements are permanently and immutably preserved for historical reference. Archived semantics cannot be reopened, modified, or deleted - they remain frozen at their final state.',
    definedIn: 'NCIP-015',
    relatedConcepts: ['Sunset Clause', 'Historical Semantics', 'Temporal Fixity'],
    termClass: 'protocol-bound',
  },

  'historical_semantics': {
    field: 'Historical Semantics',
    shortDescription: 'Preserved meaning from past agreements available for reference',
    longDescription: 'Historical Semantics refers to the preserved meaning from past agreements that remain available for reference, precedent, and historical analysis. Historical meanings are immutable and inform but do not govern current operations.',
    definedIn: 'NCIP-015',
    relatedConcepts: ['Archival Finality', 'Sunset Clause', 'Semantic Case Record'],
    termClass: 'protocol-bound',
  },

  // ============================================================================
  // Settlement & Configuration Fields (from types and config)
  // ============================================================================

  'settlement': {
    field: 'Settlement',
    shortDescription: 'Resolution of an Agreement or Dispute with final obligations',
    longDescription: 'A Settlement is the resolution of an Agreement or Dispute resulting in final obligations, compensation, or closure. Settlements require mutual declaration by all parties and create immutable records that may be capitalized into external value instruments.',
    definedIn: 'NCIP-001',
    relatedConcepts: ['Agreement', 'Dispute Resolution', 'Capitalization'],
    termClass: 'protocol-bound',
  },

  'human_authorship': {
    field: 'Human Authorship',
    shortDescription: 'Requirement that certain actions must be authored by humans',
    longDescription: 'Human Authorship is a requirement that certain critical actions (ratification, escalation, PoU generation) must be authored by humans, not automated systems. This preserves human agency and prevents fully automated consent.',
    definedIn: 'NCIP-004',
    relatedConcepts: ['Ratification', 'Proof of Understanding', 'Escalation'],
    termClass: 'core',
  },

  'consensus': {
    field: 'Consensus',
    shortDescription: 'Agreement among validators on semantic interpretation',
    longDescription: 'Consensus is the process by which multiple validators agree on semantic interpretation. Consensus aggregates weighted validator outputs, ensuring low-trust validators cannot dominate and high-trust validators cannot finalize alone. Minimum diversity thresholds apply.',
    definedIn: 'NCIP-007',
    relatedConcepts: ['Validator', 'Effective Weight', 'Dialectic Consensus'],
    termClass: 'core',
  },

  'dialectic_consensus': {
    field: 'Dialectic Consensus',
    shortDescription: 'Structured debate between Skeptic and Facilitator validators',
    longDescription: 'Dialectic Consensus is a structured debate format where validators take Skeptic and Facilitator roles. Role assignment is randomized, trust affects rhetorical weight (not speaking order), and judges aggregate weighted arguments rather than votes.',
    definedIn: 'NCIP-007',
    relatedConcepts: ['Consensus', 'Validator Trust Score'],
    termClass: 'protocol-bound',
  },
};

/**
 * Get hover tip for a specific field
 *
 * @param fieldKey - The field key to look up
 * @param config - Configuration for hover tips display
 * @returns The hover tip or undefined if not found
 */
export function getNCIPHoverTip(
  fieldKey: string,
  config: NCIPHoverTipsConfig = defaultNCIPHoverTipsConfig
): NCIPHoverTip | undefined {
  if (!config.enabled) {
    return undefined;
  }

  const normalizedKey = fieldKey.toLowerCase().replace(/[\s-]/g, '_');
  return ncipHoverTips[normalizedKey];
}

/**
 * Get formatted tooltip text for a field
 *
 * @param fieldKey - The field key to look up
 * @param config - Configuration for hover tips display
 * @returns Formatted tooltip text or empty string
 */
export function getTooltipText(
  fieldKey: string,
  config: NCIPHoverTipsConfig = defaultNCIPHoverTipsConfig
): string {
  const tip = getNCIPHoverTip(fieldKey, config);
  if (!tip) {
    return '';
  }

  let text = tip.shortDescription;

  if (!config.shortDescriptionsOnly) {
    text += `\n\n${tip.longDescription}`;
  }

  if (config.showNCIPReferences) {
    text += `\n\nDefined in: ${tip.definedIn}`;
  }

  if (config.showRelatedConcepts && tip.relatedConcepts?.length) {
    text += `\n\nRelated: ${tip.relatedConcepts.join(', ')}`;
  }

  return text;
}

/**
 * Search hover tips by keyword
 *
 * @param keyword - Search term
 * @param config - Configuration for hover tips display
 * @returns Array of matching hover tips
 */
export function searchNCIPHoverTips(
  keyword: string,
  config: NCIPHoverTipsConfig = defaultNCIPHoverTipsConfig
): NCIPHoverTip[] {
  if (!config.enabled) {
    return [];
  }

  const normalizedKeyword = keyword.toLowerCase();

  return Object.values(ncipHoverTips).filter(tip =>
    tip.field.toLowerCase().includes(normalizedKeyword) ||
    tip.shortDescription.toLowerCase().includes(normalizedKeyword) ||
    tip.longDescription.toLowerCase().includes(normalizedKeyword) ||
    tip.definedIn.toLowerCase().includes(normalizedKeyword)
  );
}

/**
 * Get all hover tips for a specific NCIP
 *
 * @param ncipNumber - The NCIP number (e.g., "NCIP-001", "001", or 1)
 * @param config - Configuration for hover tips display
 * @returns Array of hover tips defined in that NCIP
 */
export function getNCIPHoverTipsByDocument(
  ncipNumber: string | number,
  config: NCIPHoverTipsConfig = defaultNCIPHoverTipsConfig
): NCIPHoverTip[] {
  if (!config.enabled) {
    return [];
  }

  const normalizedNumber = String(ncipNumber).replace(/^NCIP-?/i, '').padStart(3, '0');
  const ncipRef = `NCIP-${normalizedNumber}`;

  return Object.values(ncipHoverTips).filter(tip =>
    tip.definedIn === ncipRef
  );
}

/**
 * Create a disabled configuration
 */
export function createDisabledConfig(): NCIPHoverTipsConfig {
  return {
    ...defaultNCIPHoverTipsConfig,
    enabled: false,
  };
}

/**
 * Create a minimal configuration (short descriptions only)
 */
export function createMinimalConfig(): NCIPHoverTipsConfig {
  return {
    ...defaultNCIPHoverTipsConfig,
    shortDescriptionsOnly: true,
    showRelatedConcepts: false,
  };
}

/**
 * Create hover tips configuration from MediatorConfig
 *
 * @param mediatorConfig - The mediator configuration object
 * @returns NCIPHoverTipsConfig derived from mediator settings
 */
export function createConfigFromMediatorConfig(mediatorConfig: {
  enableNCIPHoverTips?: boolean;
  ncipHoverTipsShortOnly?: boolean;
  ncipHoverTipsShowReferences?: boolean;
  ncipHoverTipsShowRelated?: boolean;
  ncipHoverTipsDelayMs?: number;
}): NCIPHoverTipsConfig {
  return {
    enabled: mediatorConfig.enableNCIPHoverTips ?? true,
    shortDescriptionsOnly: mediatorConfig.ncipHoverTipsShortOnly ?? false,
    showNCIPReferences: mediatorConfig.ncipHoverTipsShowReferences ?? true,
    showRelatedConcepts: mediatorConfig.ncipHoverTipsShowRelated ?? true,
    hoverDelayMs: mediatorConfig.ncipHoverTipsDelayMs ?? 300,
  };
}

/**
 * Get all available NCIP numbers
 *
 * @returns Array of NCIP document identifiers
 */
export function getAvailableNCIPs(): string[] {
  const ncips = new Set<string>();
  Object.values(ncipHoverTips).forEach(tip => {
    ncips.add(tip.definedIn);
  });
  return Array.from(ncips).sort();
}

/**
 * Get statistics about hover tips coverage
 *
 * @returns Statistics about the hover tips registry
 */
export function getHoverTipsStats(): {
  totalTips: number;
  byNCIP: Record<string, number>;
  byTermClass: Record<string, number>;
} {
  const byNCIP: Record<string, number> = {};
  const byTermClass: Record<string, number> = {};

  Object.values(ncipHoverTips).forEach(tip => {
    byNCIP[tip.definedIn] = (byNCIP[tip.definedIn] || 0) + 1;
    if (tip.termClass) {
      byTermClass[tip.termClass] = (byTermClass[tip.termClass] || 0) + 1;
    }
  });

  return {
    totalTips: Object.keys(ncipHoverTips).length,
    byNCIP,
    byTermClass,
  };
}
