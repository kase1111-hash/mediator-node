/**
 * Core Operations Benchmark
 *
 * Benchmarks for key mediator node operations:
 * - Vector database operations (add, search, similarity matching)
 * - Intent caching and retrieval
 * - Map/Set operations at scale
 */

import { VectorDatabase } from '../src/mapping/VectorDatabase';
import { Intent, MediatorConfig } from '../src/types';
import {
  benchmark,
  formatResults,
  randomString,
  randomEmbedding,
  BenchmarkResult,
} from './runner';
import * as fs from 'fs';

// Test configuration - minimal config for benchmarking
const config: MediatorConfig = {
  chainEndpoint: 'http://localhost:8545',
  chainId: 'benchmark-chain',
  consensusMode: 'permissionless',
  llmProvider: 'anthropic',
  llmApiKey: 'test-key',
  llmModel: 'claude-3-haiku-20240307',
  mediatorPrivateKey: 'benchmark-private-key',
  mediatorPublicKey: 'benchmark-mediator',
  facilitationFeePercent: 0.01,
  vectorDbPath: './benchmark-data/vectors',
  vectorDimensions: 1536,
  maxIntentsCache: 10000,
  acceptanceWindowHours: 24,
  logLevel: 'error',
};

// Cleanup benchmark data
function cleanup() {
  const benchmarkDataPath = './benchmark-data';
  if (fs.existsSync(benchmarkDataPath)) {
    fs.rmSync(benchmarkDataPath, { recursive: true });
  }
}

// Generate test intent matching the actual Intent interface
function generateIntent(index: number): Intent {
  return {
    hash: `intent-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    author: `user-${index % 100}`,
    prose: randomString(100 + Math.floor(Math.random() * 200)),
    desires: [randomString(50), randomString(50)],
    constraints: [randomString(50)],
    offeredFee: 100 + Math.floor(Math.random() * 900),
    timestamp: Date.now(),
    status: 'pending',
  };
}

async function runVectorDatabaseBenchmarks(): Promise<BenchmarkResult[]> {
  console.log('\n📊 Vector Database Benchmarks\n');

  const vectorDb = new VectorDatabase(config);
  await vectorDb.initialize(50000);

  const results: BenchmarkResult[] = [];

  // Pre-generate test data
  const intents: Intent[] = [];
  const embeddings: number[][] = [];
  for (let i = 0; i < 1000; i++) {
    intents.push(generateIntent(i));
    embeddings.push(randomEmbedding(1536));
  }

  // Benchmark: Add single intent
  let addIndex = 0;
  results.push(
    await benchmark(
      async () => {
        await vectorDb.addIntent(
          intents[addIndex % intents.length],
          embeddings[addIndex % embeddings.length]
        );
        addIndex++;
      },
      { name: 'VectorDB: Add intent', iterations: 500 }
    )
  );

  // Benchmark: Find similar intents (k=5)
  const searchEmbedding = randomEmbedding(1536);
  results.push(
    await benchmark(
      async () => {
        await vectorDb.findSimilarIntents(searchEmbedding, 5);
      },
      { name: 'VectorDB: Find similar (k=5)', iterations: 200 }
    )
  );

  // Benchmark: Find similar intents (k=20)
  results.push(
    await benchmark(
      async () => {
        await vectorDb.findSimilarIntents(searchEmbedding, 20);
      },
      { name: 'VectorDB: Find similar (k=20)', iterations: 200 }
    )
  );

  // Benchmark: Find top alignment candidates
  const embeddingsMap = new Map<string, number[]>();
  for (let i = 0; i < 100; i++) {
    embeddingsMap.set(intents[i].hash, embeddings[i]);
  }
  results.push(
    await benchmark(
      async () => {
        await vectorDb.findTopAlignmentCandidates(intents.slice(0, 100), embeddingsMap, 10);
      },
      { name: 'VectorDB: Top candidates (k=10)', iterations: 50 }
    )
  );

  // Benchmark: Get stats
  results.push(
    await benchmark(
      () => {
        vectorDb.getStats();
      },
      { name: 'VectorDB: Get stats', iterations: 1000 }
    )
  );

  // Benchmark: Save to disk
  results.push(
    await benchmark(
      async () => {
        await vectorDb.save();
      },
      { name: 'VectorDB: Save to disk', iterations: 20 }
    )
  );

  return results;
}

async function runIntentCacheBenchmarks(): Promise<BenchmarkResult[]> {
  console.log('\n📊 Intent Cache Benchmarks\n');

  const results: BenchmarkResult[] = [];

  // Use a Map to simulate intent cache performance (matches IntentIngester implementation)
  const intentCache = new Map<string, Intent>();

  // Pre-generate intents
  const intents: Intent[] = [];
  for (let i = 0; i < 10000; i++) {
    intents.push(generateIntent(i));
  }

  // Benchmark: Cache insert
  let insertIndex = 0;
  results.push(
    await benchmark(
      () => {
        const intent = intents[insertIndex % intents.length];
        intentCache.set(intent.hash, intent);
        insertIndex++;
      },
      { name: 'IntentCache: Insert', iterations: 10000 }
    )
  );

  // Benchmark: Cache lookup (existing)
  const existingHash = intents[500].hash;
  results.push(
    await benchmark(
      () => {
        intentCache.get(existingHash);
      },
      { name: 'IntentCache: Lookup (hit)', iterations: 10000 }
    )
  );

  // Benchmark: Cache lookup (missing)
  results.push(
    await benchmark(
      () => {
        intentCache.get('nonexistent-hash');
      },
      { name: 'IntentCache: Lookup (miss)', iterations: 10000 }
    )
  );

  // Benchmark: Iterate all cached intents
  results.push(
    await benchmark(
      () => {
        Array.from(intentCache.values());
      },
      { name: 'IntentCache: Iterate all (10k)', iterations: 100 }
    )
  );

  // Benchmark: Filter intents by author
  results.push(
    await benchmark(
      () => {
        Array.from(intentCache.values()).filter((i) => i.author === 'user-50');
      },
      { name: 'IntentCache: Filter by author', iterations: 100 }
    )
  );

  return results;
}

async function runEmbeddingBenchmarks(): Promise<BenchmarkResult[]> {
  console.log('\n📊 Embedding Operation Benchmarks\n');

  const results: BenchmarkResult[] = [];

  // Benchmark: Generate random embedding
  results.push(
    await benchmark(
      () => {
        randomEmbedding(1536);
      },
      { name: 'Embedding: Generate (1536d)', iterations: 1000 }
    )
  );

  // Benchmark: Cosine similarity calculation
  const embA = randomEmbedding(1536);
  const embB = randomEmbedding(1536);

  results.push(
    await benchmark(
      () => {
        let dot = 0;
        let magA = 0;
        let magB = 0;
        for (let i = 0; i < 1536; i++) {
          dot += embA[i] * embB[i];
          magA += embA[i] * embA[i];
          magB += embB[i] * embB[i];
        }
        // Use result to prevent optimization
        void (dot / (Math.sqrt(magA) * Math.sqrt(magB)));
      },
      { name: 'Embedding: Cosine similarity', iterations: 10000 }
    )
  );

  // Benchmark: Normalize embedding
  results.push(
    await benchmark(
      () => {
        const emb = randomEmbedding(1536);
        let mag = 0;
        for (let i = 0; i < 1536; i++) {
          mag += emb[i] * emb[i];
        }
        mag = Math.sqrt(mag);
        for (let i = 0; i < 1536; i++) {
          emb[i] /= mag;
        }
      },
      { name: 'Embedding: Normalize', iterations: 1000 }
    )
  );

  return results;
}

async function main() {
  console.log('🚀 NatLangChain Mediator Node - Performance Benchmarks\n');
  console.log('Configuration:');
  console.log('  - Embedding dimensions: 1536');
  console.log('  - Warmup iterations: 10');
  console.log('  - Node version:', process.version);
  console.log('  - Platform:', process.platform);
  console.log('');

  cleanup();

  // Ensure benchmark data directory exists
  fs.mkdirSync('./benchmark-data/vectors', { recursive: true });

  try {
    const allResults: BenchmarkResult[] = [];

    // Run all benchmark suites
    allResults.push(...(await runVectorDatabaseBenchmarks()));
    allResults.push(...(await runIntentCacheBenchmarks()));
    allResults.push(...(await runEmbeddingBenchmarks()));

    // Print results
    console.log(formatResults(allResults));

    // Save results to JSON
    const resultsPath = './benchmark-results.json';
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
          platform: process.platform,
          results: allResults,
        },
        null,
        2
      )
    );
    console.log(`\n📁 Results saved to ${resultsPath}`);
  } finally {
    cleanup();
  }
}

main().catch(console.error);
