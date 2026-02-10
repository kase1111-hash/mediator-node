#!/usr/bin/env npx ts-node
/**
 * Cross-Project Demo: Mediator-Node ↔ NatLangChain End-to-End
 *
 * Demonstrates the full alignment cycle:
 *   1. Connect to NatLangChain (mock or real)
 *   2. Submit complementary intents
 *   3. Ingest intents into the mediator
 *   4. Generate embeddings and find candidates
 *   5. Run LLM negotiation (or simulated if no API key)
 *   6. Submit settlement proposal to chain
 *   7. Simulate party acceptance
 *   8. Claim facilitation fee
 *
 * Usage:
 *   # Start mock chain first:
 *   cd examples/mock-chain && npm install && npm start
 *
 *   # Then run the demo (from project root):
 *   npx ts-node demo/cross-project-demo.ts
 *
 *   # Or with a custom chain endpoint:
 *   CHAIN_ENDPOINT=http://localhost:8545 npx ts-node demo/cross-project-demo.ts
 */

import axios from 'axios';
import { ChainClient } from '../src/chain';
import { IntentIngester } from '../src/ingestion/IntentIngester';
import { LLMProvider } from '../src/llm/LLMProvider';
import { SettlementManager } from '../src/settlement/SettlementManager';
import { VectorDatabase } from '../src/mapping/VectorDatabase';
import { MediatorConfig, NegotiationResult } from '../src/types';

// ============================================================================
// Configuration
// ============================================================================

const CHAIN_ENDPOINT = process.env.CHAIN_ENDPOINT || 'http://localhost:8545';
const MEDIATOR_ID = 'demo_mediator_pubkey';

const config: MediatorConfig = {
  chainEndpoint: CHAIN_ENDPOINT,
  chainId: 'natlang-mock-1',
  consensusMode: 'permissionless',
  llmProvider: process.env.LLM_PROVIDER as any || 'anthropic',
  llmApiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || 'demo-key',
  llmModel: process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022',
  mediatorPrivateKey: 'demo_mediator_privkey',
  mediatorPublicKey: MEDIATOR_ID,
  facilitationFeePercent: 2.0,
  vectorDbPath: '/tmp/mediator-demo-vectordb',
  vectorDimensions: 128,
  maxIntentsCache: 1000,
  acceptanceWindowHours: 72,
  embeddingProvider: 'fallback',
  logLevel: 'warn',
};

// ============================================================================
// Demo intents (from REFOCUS_PLAN.md)
// ============================================================================

const OFFER_INTENT = {
  content: 'I am offering a high-performance Rust library for fluid dynamics simulation. 400 hours of work. Looking for 500 NLC or equivalent compute time. Free for open-source climate models.',
  author: 'user_alice_pubkey',
  intent: 'compensation',
  metadata: {
    is_contract: true,
    contract_type: 'offer' as const,
    validation_status: 'valid' as const,
    desires: ['compensation', 'usage', 'open-source collaboration'],
    constraints: ['must be used for legitimate research', 'attribution required'],
    offered_fee: 5,
    branch: 'Professional/Engineering',
    status: 'pending',
  },
};

const SEEK_INTENT = {
  content: 'We need a high-resolution ocean current simulation for climate research. Budget of 800 NLC. Must be fast, auditable, and documented in plain English.',
  author: 'user_bob_pubkey',
  intent: 'performance',
  metadata: {
    is_contract: true,
    contract_type: 'seek' as const,
    validation_status: 'valid' as const,
    desires: ['performance', 'documentation', 'auditability'],
    constraints: ['must complete within 60 days', 'requires testing data'],
    offered_fee: 8,
    branch: 'Research/Climate',
    status: 'pending',
  },
};

// ============================================================================
// Helpers
// ============================================================================

function banner(text: string): void {
  const line = '='.repeat(68);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

function step(n: number, text: string): void {
  console.log(`\n  [Step ${n}] ${text}`);
  console.log('  ' + '-'.repeat(60));
}

function detail(label: string, value: any): void {
  const str = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  const lines = str.split('\n');
  console.log(`    ${label}: ${lines[0]}`);
  for (let i = 1; i < lines.length; i++) {
    console.log(`    ${' '.repeat(label.length + 2)}${lines[i]}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Main demo
// ============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  banner('NatLangChain x Mediator-Node: Cross-Project Demo');
  console.log(`\n  Chain endpoint: ${CHAIN_ENDPOINT}`);
  console.log(`  Mediator ID:   ${MEDIATOR_ID}`);
  console.log(`  Consensus:     ${config.consensusMode}`);
  console.log(`  Fee:           ${config.facilitationFeePercent}%`);

  // --------------------------------------------------------------------------
  // Step 1: Verify chain health
  // --------------------------------------------------------------------------
  step(1, 'Verify chain health');

  let health: any;
  try {
    const resp = await axios.get(`${CHAIN_ENDPOINT}/health`, { timeout: 5000 });
    health = resp.data;
    detail('Status', health.status);
    detail('Chain ID', health.chainId);
    detail('Consensus', health.consensusMode);
    detail('Blocks', health.blocks);
    detail('Pending entries', health.pending_entries);
  } catch (err: any) {
    console.error(`\n  ERROR: Cannot reach chain at ${CHAIN_ENDPOINT}`);
    console.error('  Start the mock chain first:');
    console.error('    cd examples/mock-chain && npm install && npm start\n');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 2: Reset chain to clean state
  // --------------------------------------------------------------------------
  step(2, 'Reset chain to clean state');

  await axios.post(`${CHAIN_ENDPOINT}/admin/reset`);
  detail('Result', 'Chain reset to initial state');

  // --------------------------------------------------------------------------
  // Step 3: Submit "offer" intent
  // --------------------------------------------------------------------------
  step(3, 'Submit OFFER intent (Alice: Rust fluid dynamics library)');

  const offerResp = await axios.post(`${CHAIN_ENDPOINT}/entry`, OFFER_INTENT);
  const offerHash = offerResp.data.hash;
  detail('Author', OFFER_INTENT.author);
  detail('Prose', OFFER_INTENT.content.substring(0, 80) + '...');
  detail('Branch', OFFER_INTENT.metadata.branch);
  detail('Offered fee', `${OFFER_INTENT.metadata.offered_fee} NLC`);
  detail('Entry hash', offerHash);

  // --------------------------------------------------------------------------
  // Step 4: Submit "seek" intent
  // --------------------------------------------------------------------------
  step(4, 'Submit SEEK intent (Bob: ocean simulation for climate research)');

  const seekResp = await axios.post(`${CHAIN_ENDPOINT}/entry`, SEEK_INTENT);
  const seekHash = seekResp.data.hash;
  detail('Author', SEEK_INTENT.author);
  detail('Prose', SEEK_INTENT.content.substring(0, 80) + '...');
  detail('Branch', SEEK_INTENT.metadata.branch);
  detail('Offered fee', `${SEEK_INTENT.metadata.offered_fee} NLC`);
  detail('Entry hash', seekHash);

  // --------------------------------------------------------------------------
  // Step 5: Phase 1 — Ingestion
  // --------------------------------------------------------------------------
  step(5, 'PHASE 1: Ingestion — poll chain for pending intents');

  const chainClient = new ChainClient({
    chainEndpoint: CHAIN_ENDPOINT,
    mediatorPublicKey: MEDIATOR_ID,
    mediatorPrivateKey: config.mediatorPrivateKey,
  });

  const intents = await chainClient.getPendingIntents({ status: 'pending', limit: 100 });

  detail('Intents found', intents.length);
  for (const intent of intents) {
    detail(`  [${intent.author}]`, `"${intent.prose.substring(0, 60)}..." (fee: ${intent.offeredFee || 0} NLC)`);
  }

  if (intents.length < 2) {
    console.error('\n  ERROR: Expected at least 2 intents, got', intents.length);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Step 6: Phase 2 — Mapping (embeddings + vector search)
  // --------------------------------------------------------------------------
  step(6, 'PHASE 2: Mapping — generate embeddings & find alignment candidates');

  const llmProvider = new LLMProvider(config);
  const embeddingCache = new Map<string, number[]>();

  for (const intent of intents) {
    try {
      const embedding = await llmProvider.generateEmbedding(intent.prose);
      embeddingCache.set(intent.hash, embedding);
      detail(`  Embedding [${intent.hash.substring(0, 12)}...]`, `${embedding.length}-dim vector (first 5: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...])`);
    } catch (err: any) {
      detail(`  Embedding FAILED [${intent.hash.substring(0, 12)}...]`, err.message);
    }
  }

  // Compute pairwise similarity
  const candidates: Array<{ intentA: any; intentB: any; similarity: number }> = [];
  const intentList = intents.filter(i => embeddingCache.has(i.hash));

  for (let i = 0; i < intentList.length; i++) {
    for (let j = i + 1; j < intentList.length; j++) {
      const a = embeddingCache.get(intentList[i].hash)!;
      const b = embeddingCache.get(intentList[j].hash)!;
      const dot = a.reduce((sum, v, k) => sum + v * b[k], 0);
      candidates.push({
        intentA: intentList[i],
        intentB: intentList[j],
        similarity: dot,
      });
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);

  detail('Candidates found', candidates.length);
  for (const c of candidates) {
    detail(
      `  ${c.intentA.author.substring(0, 15)} <-> ${c.intentB.author.substring(0, 15)}`,
      `similarity = ${c.similarity.toFixed(4)}`
    );
  }

  if (candidates.length === 0) {
    console.error('\n  ERROR: No alignment candidates found');
    process.exit(1);
  }

  const topCandidate = candidates[0];

  // --------------------------------------------------------------------------
  // Step 7: Phase 3 — Negotiation
  // --------------------------------------------------------------------------
  step(7, 'PHASE 3: Negotiation — LLM-simulated alignment analysis');

  let negotiationResult: NegotiationResult;
  const hasRealLLM = config.llmApiKey !== 'demo-key';

  if (hasRealLLM) {
    detail('LLM provider', config.llmProvider);
    detail('Model', config.llmModel);
    console.log('    Running live LLM negotiation...');

    try {
      negotiationResult = await llmProvider.negotiateAlignment(
        topCandidate.intentA,
        topCandidate.intentB
      );
    } catch (err: any) {
      detail('LLM call failed', err.message);
      detail('Falling back', 'simulated negotiation result');
      negotiationResult = createSimulatedNegotiation(topCandidate);
    }
  } else {
    detail('LLM provider', 'SIMULATED (no API key configured)');
    detail('Note', 'Set ANTHROPIC_API_KEY or OPENAI_API_KEY for live negotiation');
    negotiationResult = createSimulatedNegotiation(topCandidate);
  }

  detail('Success', negotiationResult.success);
  detail('Confidence', `${negotiationResult.confidenceScore}/100`);
  detail('Reasoning', negotiationResult.reasoning);
  detail('Proposed terms', negotiationResult.proposedTerms);
  detail('Model used', negotiationResult.modelUsed);

  if (!negotiationResult.success) {
    console.log('\n    Negotiation did not find alignment. Demo ends here.');
    console.log('    (With a real LLM, these intents would likely align.)\n');
    process.exit(0);
  }

  // --------------------------------------------------------------------------
  // Step 8: Phase 4 — Submission
  // --------------------------------------------------------------------------
  step(8, 'PHASE 4: Submission — create and submit settlement to chain');

  const settlementManager = new SettlementManager(config, chainClient);
  const settlement = settlementManager.createSettlement(
    topCandidate.intentA,
    topCandidate.intentB,
    negotiationResult
  );

  detail('Settlement ID', settlement.id);
  detail('Intent A', settlement.intentHashA);
  detail('Intent B', settlement.intentHashB);
  detail('Fee', `${settlement.facilitationFee} NLC (${settlement.facilitationFeePercent}%)`);
  detail('Deadline', new Date(settlement.acceptanceDeadline).toISOString());
  detail('Status', settlement.status);

  console.log('\n    Submitting to chain...');
  const submitted = await settlementManager.submitSettlement(settlement);
  detail('Submitted', submitted);

  if (!submitted) {
    console.error('\n  ERROR: Settlement submission failed');
    process.exit(1);
  }

  // Verify on chain
  const contracts = await axios.get(`${CHAIN_ENDPOINT}/contract/list?status=open`);
  detail('Open contracts on chain', contracts.data.contracts?.length || 0);

  // --------------------------------------------------------------------------
  // Step 9: Simulate party acceptance
  // --------------------------------------------------------------------------
  step(9, 'Simulate party acceptance');

  console.log('    Party A (Alice) accepts...');
  await axios.post(`${CHAIN_ENDPOINT}/admin/accept-settlement`, {
    settlementId: settlement.id,
    party: 'A',
  });
  detail('Party A accepted', true);

  console.log('    Party B (Bob) accepts...');
  await axios.post(`${CHAIN_ENDPOINT}/admin/accept-settlement`, {
    settlementId: settlement.id,
    party: 'B',
  });
  detail('Party B accepted', true);

  // --------------------------------------------------------------------------
  // Step 10: Verify fee collection
  // --------------------------------------------------------------------------
  step(10, 'Verify fee collection (payout)');

  const payoutResult = await chainClient.submitPayout(settlement.id, settlement.facilitationFee);
  detail('Payout submitted', payoutResult.success);
  detail('Fee collected', `${settlement.facilitationFee} NLC`);

  // Final chain stats
  const stats = await axios.get(`${CHAIN_ENDPOINT}/stats`);
  detail('Final chain stats', stats.data);

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  banner('Demo Complete');
  console.log(`
  Full alignment cycle demonstrated in ${elapsed}s:

    1. Chain health verified
    2. Two complementary intents submitted (offer + seek)
    3. Intents ingested from chain (${intents.length} found)
    4. Embeddings generated (${embeddingCache.size} vectors, ${config.vectorDimensions}-dim)
    5. Alignment candidates found (${candidates.length} pairs)
    6. LLM negotiation: confidence ${negotiationResult.confidenceScore}/100
    7. Settlement proposed (fee: ${settlement.facilitationFee} NLC)
    8. Both parties accepted
    9. Fee collected: ${settlement.facilitationFee} NLC

  The mediator earned ${settlement.facilitationFee} NLC for aligning:
    Alice's Rust fluid dynamics library
    with Bob's ocean simulation needs.

  This is the core loop that makes NatLangChain work.
`);
}

// ============================================================================
// Simulated negotiation (when no LLM key is available)
// ============================================================================

function createSimulatedNegotiation(candidate: {
  intentA: any;
  intentB: any;
  similarity: number;
}): NegotiationResult {
  return {
    success: true,
    reasoning:
      'Both intents exhibit strong semantic alignment. ' +
      'Party A offers a high-performance Rust library for fluid dynamics simulation ' +
      '(400 hours of work, 500 NLC). Party B seeks a high-resolution ocean current ' +
      'simulation for climate research (800 NLC budget). ' +
      'The offer directly satisfies the seek: fluid dynamics simulation is the core ' +
      'technology needed for ocean current modeling. Both parties operate in compatible ' +
      'domains (Professional/Engineering and Research/Climate). ' +
      "Party A's open-source climate model exception aligns with Party B's research purpose. " +
      'Proposed: Party B pays 500 NLC for the library plus 100 NLC for documentation ' +
      'and audit requirements. Remaining 200 NLC held in escrow for 60-day completion window.',
    proposedTerms: {
      price: 600,
      deliverables: [
        'Rust fluid dynamics simulation library',
        'Plain English documentation',
        'Audit trail for reproducibility',
        'Test data compatibility verification',
      ],
      timelines: '60 days',
      customTerms: { escrow: 200 },
    },
    confidenceScore: 87,
    modelUsed: 'simulated (no API key)',
    promptHash: 'demo-simulated',
  };
}

// ============================================================================
// Run
// ============================================================================

main().catch(err => {
  console.error('\nDemo failed:', err.message || err);
  process.exit(1);
});
