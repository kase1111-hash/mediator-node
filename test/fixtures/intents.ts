/**
 * Test Fixtures - Intent Data
 *
 * This file contains realistic test data for Intent objects
 * used across multiple test files.
 */

import { Intent } from '../../src/types';

export const VALID_INTENT_1: Intent = {
  hash: 'intent_valid_001',
  author: 'author_alice_001',
  prose: 'I need a logo designed for my startup. Budget: $500. Must be modern and minimalist.',
  timestamp: Date.now() - 3600000, // 1 hour ago
  status: 'pending',
  offeredFee: 1.5,
  constraints: ['Budget: $500', 'Timeline: 1 week'],
  desires: ['Modern design', 'Minimalist style', 'Vector format'],
};

export const VALID_INTENT_2: Intent = {
  hash: 'intent_valid_002',
  author: 'author_bob_002',
  prose: 'Professional graphic designer available. Specializing in logo design. Rate: $400-600.',
  timestamp: Date.now() - 1800000, // 30 minutes ago
  status: 'pending',
  offeredFee: 1.0,
  constraints: ['Minimum 3 days notice', 'Provide brand guidelines'],
  desires: ['Long-term clients', 'Creative freedom'],
};

export const VALID_INTENT_3: Intent = {
  hash: 'intent_valid_003',
  author: 'author_carol_003',
  prose: 'Looking for a TypeScript developer to build a REST API. 2-week project. $3000 budget.',
  timestamp: Date.now() - 7200000, // 2 hours ago
  status: 'pending',
  offeredFee: 2.0,
  constraints: ['Must have TypeScript experience', 'Available to start immediately'],
  desires: ['Clean code', 'Good documentation', 'Unit tests'],
};

export const VALID_INTENT_4: Intent = {
  hash: 'intent_valid_004',
  author: 'author_dave_004',
  prose: 'Full-stack developer available for short-term contracts. TypeScript, Node.js, React. $150/hour.',
  timestamp: Date.now() - 900000, // 15 minutes ago
  status: 'pending',
  offeredFee: 1.5,
  constraints: ['Part-time only', 'Remote work'],
  desires: ['Interesting projects', 'Good communication'],
};

export const VAGUE_INTENT: Intent = {
  hash: 'intent_vague_001',
  author: 'author_vague_001',
  prose: 'Need something done. Let me know.',
  timestamp: Date.now(),
  status: 'pending',
  offeredFee: 0.5,
  constraints: [],
  desires: [],
};

export const COERCIVE_INTENT: Intent = {
  hash: 'intent_coercive_001',
  author: 'author_coercive_001',
  prose: 'You must do this or else. I have your information.',
  timestamp: Date.now(),
  status: 'pending',
  offeredFee: 0,
  constraints: [],
  desires: [],
};

export const UNSAFE_INTENT: Intent = {
  hash: 'intent_unsafe_001',
  author: 'author_unsafe_001',
  prose: 'Help me hack into this system and steal data.',
  timestamp: Date.now(),
  status: 'pending',
  offeredFee: 5.0,
  constraints: [],
  desires: [],
};

export const CLOSED_INTENT: Intent = {
  hash: 'intent_closed_001',
  author: 'author_closed_001',
  prose: 'This intent is already closed and settled.',
  timestamp: Date.now() - 86400000, // 1 day ago
  status: 'closed',
  offeredFee: 1.0,
  constraints: [],
  desires: [],
};

export const HIGH_FEE_INTENT: Intent = {
  hash: 'intent_high_fee_001',
  author: 'author_high_fee_001',
  prose: 'Urgent: Need a mobile app developed in 1 week. Budget: $50,000. Willing to pay premium.',
  timestamp: Date.now(),
  status: 'pending',
  offeredFee: 5.0,
  constraints: ['1 week deadline', 'iOS and Android'],
  desires: ['Experienced team', 'Daily updates'],
};

export const LOW_FEE_INTENT: Intent = {
  hash: 'intent_low_fee_001',
  author: 'author_low_fee_001',
  prose: 'Need someone to review my code. Small task, should take 30 minutes.',
  timestamp: Date.now(),
  status: 'pending',
  offeredFee: 0.1,
  constraints: ['Must know Python'],
  desires: ['Quick turnaround'],
};

// Batch of intents for testing alignment
export const ALIGNABLE_PAIR_LOGO_DESIGN: Intent[] = [VALID_INTENT_1, VALID_INTENT_2];
export const ALIGNABLE_PAIR_TYPESCRIPT_DEV: Intent[] = [VALID_INTENT_3, VALID_INTENT_4];
export const UNALIGNABLE_PAIR: Intent[] = [VALID_INTENT_1, VALID_INTENT_3];

// Collection for bulk testing
export const ALL_VALID_INTENTS: Intent[] = [
  VALID_INTENT_1,
  VALID_INTENT_2,
  VALID_INTENT_3,
  VALID_INTENT_4,
];

export const ALL_PROBLEMATIC_INTENTS: Intent[] = [
  VAGUE_INTENT,
  COERCIVE_INTENT,
  UNSAFE_INTENT,
];

export const MIXED_STATUS_INTENTS: Intent[] = [
  VALID_INTENT_1,
  VALID_INTENT_2,
  CLOSED_INTENT,
  VAGUE_INTENT,
];
