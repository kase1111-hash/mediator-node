/**
 * Data transformers for NatLangChain ↔ Mediator-Node compatibility
 *
 * NatLangChain uses a prose-first model with different field names.
 * This module provides bidirectional transformations.
 */

import { Intent, IntentStatus, ProposedSettlement, Challenge } from '../types';
import { generateIntentHash } from '../utils/crypto';

/**
 * NatLangChain Entry structure (as received from chain)
 */
export interface NatLangChainEntry {
  content: string;
  author: string;
  intent: string;
  timestamp?: number;
  metadata?: {
    validation_status?: 'valid' | 'pending' | 'invalid';
    is_contract?: boolean;
    contract_type?: 'offer' | 'seek' | 'proposal' | 'response' | 'closure';
    temporal_fixity_enabled?: boolean;
    hash?: string;
    desires?: string[];
    constraints?: string[];
    offered_fee?: number;
    branch?: string;
    flag_count?: number;
    status?: string;
    [key: string]: any;
  };
}

/**
 * NatLangChain Contract structure
 */
export interface NatLangChainContract {
  contract_id?: string;
  offer_ref?: string;
  seek_ref?: string;
  proposal_content?: string;
  match_score?: number;
  facilitation_fee?: number;
  status?: string;
  parties?: string[];
  terms?: Record<string, any>;
  mediator_id?: string;
  timestamp?: number;
  acceptance_deadline?: number;
  party_a_accepted?: boolean;
  party_b_accepted?: boolean;
  challenges?: any[];
}

/**
 * NatLangChain Block structure
 */
export interface NatLangChainBlock {
  index: number;
  timestamp: number;
  entries: NatLangChainEntry[];
  previous_hash: string;
  nonce: number;
  hash: string;
}

/**
 * Transform NatLangChain Entry to Mediator Intent
 */
export function entryToIntent(entry: NatLangChainEntry): Intent {
  const timestamp = entry.timestamp || Date.now();
  const hash = entry.metadata?.hash || generateIntentHash(entry.content, entry.author, timestamp);

  // Extract desires from intent field or metadata
  const desires = entry.metadata?.desires || extractDesiresFromContent(entry.content, entry.intent);

  // Extract constraints from content
  const constraints = entry.metadata?.constraints || extractConstraintsFromContent(entry.content);

  // Map validation_status to IntentStatus
  const status = mapValidationStatusToIntentStatus(
    entry.metadata?.status || entry.metadata?.validation_status
  );

  return {
    hash,
    author: entry.author,
    prose: entry.content,
    desires,
    constraints,
    offeredFee: entry.metadata?.offered_fee,
    timestamp,
    status,
    branch: entry.metadata?.branch,
    flagCount: entry.metadata?.flag_count || 0,
  };
}

/**
 * Transform Mediator Intent to NatLangChain Entry
 */
export function intentToEntry(intent: Intent): NatLangChainEntry {
  return {
    content: intent.prose,
    author: intent.author,
    intent: intent.desires.length > 0 ? intent.desires[0] : 'general intent',
    timestamp: intent.timestamp,
    metadata: {
      hash: intent.hash,
      desires: intent.desires,
      constraints: intent.constraints,
      offered_fee: intent.offeredFee,
      branch: intent.branch,
      flag_count: intent.flagCount,
      status: intent.status,
      is_contract: true,
      contract_type: 'offer',
      validation_status: 'pending',
    },
  };
}

/**
 * Transform NatLangChain Contract to ProposedSettlement
 */
export function contractToSettlement(contract: NatLangChainContract): ProposedSettlement {
  return {
    id: contract.contract_id || '',
    intentHashA: contract.offer_ref || '',
    intentHashB: contract.seek_ref || '',
    reasoningTrace: contract.proposal_content || '',
    proposedTerms: {
      customTerms: contract.terms,
    },
    facilitationFee: contract.facilitation_fee || 0,
    facilitationFeePercent: 0, // Will be calculated if needed
    modelIntegrityHash: '',
    mediatorId: contract.mediator_id || '',
    timestamp: contract.timestamp || Date.now(),
    status: mapContractStatusToSettlementStatus(contract.status),
    acceptanceDeadline: contract.acceptance_deadline || Date.now() + 72 * 60 * 60 * 1000,
    partyAAccepted: contract.party_a_accepted || false,
    partyBAccepted: contract.party_b_accepted || false,
    challenges: contract.challenges?.map(c => transformChallenge(c)) || [],
  };
}

/**
 * Transform ProposedSettlement to NatLangChain Contract proposal
 */
export function settlementToContractProposal(
  settlement: ProposedSettlement,
  matchScore?: number
): {
  offer_ref: string;
  seek_ref: string;
  proposal_content: string;
  match_score: number;
  facilitation_fee: number;
  terms: Record<string, any>;
  mediator_id: string;
  timestamp: number;
  acceptance_deadline: number;
} {
  return {
    offer_ref: settlement.intentHashA,
    seek_ref: settlement.intentHashB,
    proposal_content: settlement.reasoningTrace,
    match_score: matchScore || 0.85,
    facilitation_fee: settlement.facilitationFeePercent,
    terms: {
      ...settlement.proposedTerms,
      settlement_id: settlement.id,
      model_integrity_hash: settlement.modelIntegrityHash,
    },
    mediator_id: settlement.mediatorId,
    timestamp: settlement.timestamp,
    acceptance_deadline: settlement.acceptanceDeadline,
  };
}

/**
 * Transform settlement to prose entry for chain submission
 */
export function settlementToEntry(
  settlement: ProposedSettlement,
  mediatorId: string
): NatLangChainEntry {
  const termsStr = JSON.stringify(settlement.proposedTerms, null, 2);

  const content = `[PROPOSED SETTLEMENT]

Settlement ID: ${settlement.id}
Linking Intent #${settlement.intentHashA} (Party A) and #${settlement.intentHashB} (Party B)

Reasoning: ${settlement.reasoningTrace}

Proposed Terms:
${termsStr}

Facilitation Fee: ${settlement.facilitationFeePercent}% (${settlement.facilitationFee} NLC) to Mediator ${settlement.mediatorId}

Model Integrity Hash: ${settlement.modelIntegrityHash}
${settlement.stakeReference ? `Stake Reference: ${settlement.stakeReference}` : ''}
${settlement.authoritySignature ? `Authority Signature: ${settlement.authoritySignature}` : ''}

Acceptance Deadline: ${new Date(settlement.acceptanceDeadline).toISOString()}`;

  return {
    content,
    author: mediatorId,
    intent: 'settlement_proposal',
    timestamp: settlement.timestamp,
    metadata: {
      is_contract: true,
      contract_type: 'proposal',
      settlement_id: settlement.id,
      intent_hash_a: settlement.intentHashA,
      intent_hash_b: settlement.intentHashB,
      facilitation_fee: settlement.facilitationFee,
      facilitation_fee_percent: settlement.facilitationFeePercent,
      acceptance_deadline: settlement.acceptanceDeadline,
    },
  };
}

/**
 * Transform challenge for chain submission
 */
export function challengeToEntry(
  challenge: Challenge,
  mediatorId: string
): NatLangChainEntry {
  const content = `[CHALLENGE]

Challenge ID: ${challenge.id}
Settlement ID: ${challenge.settlementId}
Challenger: ${challenge.challengerId}

Contradiction Proof:
${challenge.contradictionProof}

Paraphrase Evidence:
${challenge.paraphraseEvidence}

Submitted: ${new Date(challenge.timestamp).toISOString()}`;

  return {
    content,
    author: mediatorId,
    intent: 'settlement_challenge',
    timestamp: challenge.timestamp,
    metadata: {
      challenge_id: challenge.id,
      settlement_id: challenge.settlementId,
      challenger_id: challenge.challengerId,
      status: challenge.status,
    },
  };
}

/**
 * Extract desires from content and intent field
 */
function extractDesiresFromContent(content: string, intentField: string): string[] {
  const desires: string[] = [];

  // Add the intent field as a desire
  if (intentField && intentField.trim()) {
    desires.push(intentField.trim());
  }

  // Extract from content using patterns
  const desirePatterns = [
    /I (?:want|need|seek|require|am looking for) (.+?)(?:\.|,|$)/gi,
    /looking for (.+?)(?:\.|,|$)/gi,
    /seeking (.+?)(?:\.|,|$)/gi,
  ];

  for (const pattern of desirePatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        desires.push(match[1].trim());
      }
    }
  }

  return desires.length > 0 ? desires : ['general collaboration'];
}

/**
 * Extract constraints from content
 */
function extractConstraintsFromContent(content: string): string[] {
  const constraints: string[] = [];

  const constraintPatterns = [
    /must (?:be|have|include) (.+?)(?:\.|,|$)/gi,
    /(?:cannot|will not|won't) (.+?)(?:\.|,|$)/gi,
    /requires? (.+?)(?:\.|,|$)/gi,
  ];

  for (const pattern of constraintPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        constraints.push(match[1].trim());
      }
    }
  }

  return constraints;
}

/**
 * Map NatLangChain validation status to IntentStatus
 */
function mapValidationStatusToIntentStatus(
  status?: string
): IntentStatus {
  if (!status) return 'pending';

  const statusMap: Record<string, IntentStatus> = {
    'valid': 'pending',
    'pending': 'pending',
    'invalid': 'rejected',
    'accepted': 'accepted',
    'rejected': 'rejected',
    'closed': 'closed',
    'unalignable': 'unalignable',
  };

  return statusMap[status.toLowerCase()] || 'pending';
}

/**
 * Map NatLangChain contract status to SettlementStatus
 */
function mapContractStatusToSettlementStatus(
  status?: string
): ProposedSettlement['status'] {
  if (!status) return 'proposed';

  const statusMap: Record<string, ProposedSettlement['status']> = {
    'open': 'proposed',
    'proposed': 'proposed',
    'accepted': 'accepted',
    'rejected': 'rejected',
    'closed': 'closed',
    'challenged': 'challenged',
  };

  return statusMap[status.toLowerCase()] || 'proposed';
}

/**
 * Transform raw challenge data to Challenge type
 */
function transformChallenge(rawChallenge: any): Challenge {
  return {
    id: rawChallenge.challenge_id || rawChallenge.id || '',
    settlementId: rawChallenge.settlement_id || rawChallenge.settlementId || '',
    challengerId: rawChallenge.challenger_id || rawChallenge.challengerId || '',
    contradictionProof: rawChallenge.contradiction_proof || rawChallenge.contradictionProof || '',
    paraphraseEvidence: rawChallenge.paraphrase_evidence || rawChallenge.paraphraseEvidence || '',
    timestamp: rawChallenge.timestamp || Date.now(),
    status: rawChallenge.status || 'pending',
    validators: rawChallenge.validators || [],
  };
}

/**
 * Transform burn transaction for chain submission
 */
export function burnToEntry(
  burnData: {
    type: string;
    author: string;
    amount: number;
    intentHash?: string;
    settlementId?: string;
    multiplier?: number;
  },
  mediatorId: string
): NatLangChainEntry {
  const content = `[BURN TRANSACTION]

Type: ${burnData.type}
Author: ${burnData.author}
Amount: ${burnData.amount} NLC
${burnData.intentHash ? `Intent: ${burnData.intentHash}` : ''}
${burnData.settlementId ? `Settlement: ${burnData.settlementId}` : ''}
${burnData.multiplier ? `Multiplier: ${burnData.multiplier}x` : ''}

Timestamp: ${new Date().toISOString()}`;

  return {
    content,
    author: mediatorId,
    intent: 'burn_transaction',
    timestamp: Date.now(),
    metadata: {
      burn_type: burnData.type,
      burn_author: burnData.author,
      burn_amount: burnData.amount,
      intent_hash: burnData.intentHash,
      settlement_id: burnData.settlementId,
      multiplier: burnData.multiplier,
    },
  };
}

/**
 * Parse intents from NatLangChain response formats
 */
export function parseIntentsFromResponse(response: any): Intent[] {
  // Handle different response formats
  if (Array.isArray(response)) {
    return response.map(item => {
      if (item.content && item.author) {
        return entryToIntent(item as NatLangChainEntry);
      }
      return item as Intent;
    });
  }

  if (response.entries && Array.isArray(response.entries)) {
    return response.entries.map((entry: NatLangChainEntry) => entryToIntent(entry));
  }

  if (response.intents && Array.isArray(response.intents)) {
    return response.intents.map((item: any) => {
      if (item.content && item.author) {
        return entryToIntent(item as NatLangChainEntry);
      }
      return item as Intent;
    });
  }

  if (response.results && Array.isArray(response.results)) {
    return response.results.map((item: any) => {
      if (item.content && item.author) {
        return entryToIntent(item as NatLangChainEntry);
      }
      return item as Intent;
    });
  }

  return [];
}
