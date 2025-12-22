/**
 * Test Fixtures - Settlement Data
 *
 * This file contains realistic test data for ProposedSettlement objects
 */

import { ProposedSettlement } from '../../src/types';
import { VALID_INTENT_1, VALID_INTENT_2, VALID_INTENT_3, VALID_INTENT_4 } from './intents';

const ACCEPTANCE_WINDOW = 72 * 60 * 60 * 1000; // 72 hours in ms

export const PROPOSED_SETTLEMENT_1: ProposedSettlement = {
  id: 'settlement_001',
  intentHashA: VALID_INTENT_1.hash,
  intentHashB: VALID_INTENT_2.hash,
  reasoningTrace: 'Party A needs a logo designer, Party B is a professional designer. Budget aligns, timeline works.',
  proposedTerms: {
    price: 500,
    deliverables: ['Modern minimalist logo', 'Vector files (SVG, AI)', '2 revision rounds'],
    timelines: '5 days from acceptance',
    customTerms: {
      description: 'Bob will design a modern, minimalist logo for Alice',
      deliveryMethod: 'Digital files via email',
    },
  },
  facilitationFee: 1.25,
  facilitationFeePercent: 0.25,
  mediatorId: 'mediator_test_001',
  modelIntegrityHash: 'model_hash_claude_3_5_sonnet',
  timestamp: Date.now() - 1800000,
  acceptanceDeadline: Date.now() - 1800000 + ACCEPTANCE_WINDOW,
  status: 'proposed',
};

export const PROPOSED_SETTLEMENT_2: ProposedSettlement = {
  id: 'settlement_002',
  intentHashA: VALID_INTENT_3.hash,
  intentHashB: VALID_INTENT_4.hash,
  reasoningTrace: 'Party A needs TypeScript API development, Party B is a TypeScript specialist. Budget and timeline match.',
  proposedTerms: {
    price: 3000,
    deliverables: ['REST API in TypeScript', 'Unit tests', 'API documentation'],
    timelines: '2 weeks',
    customTerms: {
      description: 'Dave will develop a REST API in TypeScript for Carol',
      hourlyRate: 150,
      estimatedHours: 20,
      workArrangement: 'Remote, part-time',
    },
  },
  facilitationFee: 2.0,
  facilitationFeePercent: 0.067,
  mediatorId: 'mediator_test_001',
  modelIntegrityHash: 'model_hash_claude_3_5_sonnet',
  timestamp: Date.now() - 900000,
  acceptanceDeadline: Date.now() - 900000 + ACCEPTANCE_WINDOW,
  status: 'proposed',
};

export const ACCEPTED_SETTLEMENT: ProposedSettlement = {
  id: 'settlement_accepted_001',
  intentHashA: VALID_INTENT_1.hash,
  intentHashB: VALID_INTENT_2.hash,
  reasoningTrace: 'Alignment successful',
  proposedTerms: {
    price: 500,
    deliverables: ['Logo design'],
    timelines: '1 week',
  },
  facilitationFee: 1.0,
  facilitationFeePercent: 0.2,
  mediatorId: 'mediator_test_001',
  modelIntegrityHash: 'model_hash_test',
  timestamp: Date.now() - 86400000,
  acceptanceDeadline: Date.now() - 86400000 + ACCEPTANCE_WINDOW,
  status: 'accepted',
  partyAAccepted: true,
  partyBAccepted: true,
};

export const REJECTED_SETTLEMENT: ProposedSettlement = {
  id: 'settlement_rejected_001',
  intentHashA: VALID_INTENT_3.hash,
  intentHashB: VALID_INTENT_4.hash,
  reasoningTrace: 'Attempted alignment but parties rejected',
  proposedTerms: {
    price: 5000,
    deliverables: ['API development'],
    timelines: '3 weeks',
  },
  facilitationFee: 1.5,
  facilitationFeePercent: 0.03,
  mediatorId: 'mediator_test_001',
  modelIntegrityHash: 'model_hash_test',
  timestamp: Date.now() - 172800000,
  acceptanceDeadline: Date.now() - 172800000 + ACCEPTANCE_WINDOW,
  status: 'rejected',
  partyAAccepted: false,
  partyBAccepted: false,
};

export const CLOSED_SETTLEMENT: ProposedSettlement = {
  id: 'settlement_closed_001',
  intentHashA: VALID_INTENT_1.hash,
  intentHashB: VALID_INTENT_2.hash,
  reasoningTrace: 'Successfully closed',
  proposedTerms: {
    price: 500,
    deliverables: ['Work completed'],
    timelines: 'Completed',
  },
  facilitationFee: 1.0,
  facilitationFeePercent: 0.2,
  mediatorId: 'mediator_test_001',
  modelIntegrityHash: 'model_hash_test',
  timestamp: Date.now() - 259200000,
  acceptanceDeadline: Date.now() - 259200000 + ACCEPTANCE_WINDOW,
  status: 'closed',
  partyAAccepted: true,
  partyBAccepted: true,
};

export const SETTLEMENT_WITH_STAKE: ProposedSettlement = {
  id: 'settlement_stake_001',
  intentHashA: VALID_INTENT_1.hash,
  intentHashB: VALID_INTENT_2.hash,
  reasoningTrace: 'Settlement with DPoS stake',
  proposedTerms: {
    price: 1000,
    deliverables: ['Premium service'],
    timelines: '1 week',
  },
  facilitationFee: 2.0,
  facilitationFeePercent: 0.2,
  mediatorId: 'mediator_test_001',
  modelIntegrityHash: 'model_hash_test',
  timestamp: Date.now(),
  acceptanceDeadline: Date.now() + ACCEPTANCE_WINDOW,
  status: 'proposed',
  stakeReference: 'stake_ref_12345',
  effectiveStake: 1000,
};

export const SETTLEMENT_WITH_AUTHORITY: ProposedSettlement = {
  id: 'settlement_authority_001',
  intentHashA: VALID_INTENT_1.hash,
  intentHashB: VALID_INTENT_2.hash,
  reasoningTrace: 'Settlement with PoA authority',
  proposedTerms: {
    price: 500,
    deliverables: ['Authorized service'],
    timelines: '1 week',
  },
  facilitationFee: 1.5,
  facilitationFeePercent: 0.3,
  mediatorId: 'mediator_test_001',
  modelIntegrityHash: 'model_hash_test',
  timestamp: Date.now(),
  acceptanceDeadline: Date.now() + ACCEPTANCE_WINDOW,
  status: 'proposed',
  authoritySignature: 'sig_authority_abcdef123456',
};

export const ALL_SETTLEMENTS: ProposedSettlement[] = [
  PROPOSED_SETTLEMENT_1,
  PROPOSED_SETTLEMENT_2,
  ACCEPTED_SETTLEMENT,
  REJECTED_SETTLEMENT,
  CLOSED_SETTLEMENT,
];
