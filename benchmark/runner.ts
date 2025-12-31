/**
 * Benchmark Runner
 *
 * Provides utilities for running and reporting performance benchmarks.
 */

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  opsPerSecond: number;
  memoryUsageMb?: number;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmupIterations?: number;
  name: string;
}

/**
 * Run a benchmark and collect timing statistics
 */
export async function benchmark(
  fn: () => Promise<void> | void,
  options: BenchmarkOptions
): Promise<BenchmarkResult> {
  const iterations = options.iterations || 100;
  const warmupIterations = options.warmupIterations || 10;
  const times: number[] = [];

  // Warmup phase
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const startMemory = process.memoryUsage().heapUsed;

  // Benchmark phase
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const endMemory = process.memoryUsage().heapUsed;

  const totalTimeMs = times.reduce((a, b) => a + b, 0);
  const avgTimeMs = totalTimeMs / iterations;
  const minTimeMs = Math.min(...times);
  const maxTimeMs = Math.max(...times);
  const opsPerSecond = 1000 / avgTimeMs;
  const memoryUsageMb = (endMemory - startMemory) / (1024 * 1024);

  return {
    name: options.name,
    iterations,
    totalTimeMs,
    avgTimeMs,
    minTimeMs,
    maxTimeMs,
    opsPerSecond,
    memoryUsageMb,
  };
}

/**
 * Run multiple benchmarks in sequence
 */
export async function runBenchmarkSuite(
  benchmarks: Array<{ name: string; fn: () => Promise<void> | void; iterations?: number }>
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const bench of benchmarks) {
    console.log(`Running: ${bench.name}...`);
    const result = await benchmark(bench.fn, {
      name: bench.name,
      iterations: bench.iterations,
    });
    results.push(result);
  }

  return results;
}

/**
 * Format benchmark results as a table
 */
export function formatResults(results: BenchmarkResult[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(90));
  lines.push('BENCHMARK RESULTS');
  lines.push('='.repeat(90));
  lines.push('');

  const header = [
    'Benchmark'.padEnd(35),
    'Avg (ms)'.padStart(12),
    'Min (ms)'.padStart(12),
    'Max (ms)'.padStart(12),
    'Ops/sec'.padStart(12),
  ].join(' | ');

  lines.push(header);
  lines.push('-'.repeat(90));

  for (const result of results) {
    const row = [
      result.name.padEnd(35),
      result.avgTimeMs.toFixed(3).padStart(12),
      result.minTimeMs.toFixed(3).padStart(12),
      result.maxTimeMs.toFixed(3).padStart(12),
      result.opsPerSecond.toFixed(1).padStart(12),
    ].join(' | ');
    lines.push(row);
  }

  lines.push('');
  lines.push('='.repeat(90));

  return lines.join('\n');
}

/**
 * Generate a random string of specified length
 */
export function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a random embedding vector
 */
export function randomEmbedding(dimensions: number = 1536): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    embedding.push(Math.random() * 2 - 1);
  }
  return embedding;
}
