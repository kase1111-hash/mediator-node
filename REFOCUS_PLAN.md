# Mediator-Node Refocus Plan

## Executive Summary

This plan reduces the mediator-node from ~34,500 lines to approximately 8,000–10,000 lines by cutting features that NatLangChain has itself cut or deferred, removing subsystems built for infrastructure that does not yet exist, and realigning the mediator's API surface with NatLangChain's actual post-refocus endpoints.

NatLangChain is executing its own refocus (92K → ~35K lines, 7 phases, 20–30 days). This plan is designed to track that timeline and produce a working cross-project demo at the end.

**Guiding principle:** The mediator-node should only implement features that NatLangChain can actually serve. If the chain doesn't support it, the mediator shouldn't build for it.

---

## NatLangChain Post-Refocus Reality

After NatLangChain completes its refocus, these are the surviving endpoints the mediator can actually call:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/entry` | POST | Submit any entry (intents, settlements, challenges) |
| `/pending` | GET | Get unmined entries |
| `/entries/search?intent=<keyword>` | GET | Search entries by keyword |
| `/entries/author/<author>` | GET | Get entries by author |
| `/search/semantic` | POST | Meaning-based semantic search |
| `/contract/list?status=open` | GET | Get open contracts |
| `/contract/match` | POST | Find matching contracts |
| `/contract/parse` | POST | Parse natural language contract |
| `/contract/respond` | POST | Submit contract proposal/response |
| `/chain` | GET | Get full blockchain |
| `/chain/narrative` | GET | Human-readable chain history |
| `/validate/chain` | GET | Chain integrity validation |

**What NatLangChain has cut or deferred:**
- Token economics (no burns, no treasury, no market pricing)
- P2P networking (single centralized Flask server)
- Dispute resolution (deferred to `_deferred/`)
- Multi-model consensus (deferred)
- Negotiation engine (deferred — simplified to single-round matching)
- DID identity (deferred)
- SIEM/FIDO2/jurisdictional compliance (cut entirely)
- Frontend and SDK (deferred)
- Mediator-specific endpoints (`/mediator/register`, `/mediator/claim-fee`) — not implemented

**What NatLangChain keeps:**
- Blockchain data structures with SHA-256 chaining
- Proof of Understanding (PoU) validation via LLM
- Semantic search via embeddings
- Contract parsing and matching
- Entry quality checks and rate limiting
- Pluggable storage backends (JSON, PostgreSQL, memory)

---

## Impact Calculation

| Phase | Lines Removed | Lines Added | Net Change |
|-------|--------------|-------------|------------|
| Phase 0: Preparation | 0 | 0 | 0 |
| Phase 1: Cut Dead Modules | ~14,000 | 0 | -14,000 |
| Phase 2: Defer Premature Modules | ~6,000 | 0 | -6,000 |
| Phase 3: Fix Mock Chain | ~200 | ~300 | +100 |
| Phase 4: Fix Broken Tests | ~500 | ~800 | +300 |
| Phase 5: Harden Core Loop | ~200 | ~500 | +300 |
| Phase 6: Prove the Cross-Project Loop | 0 | ~300 | +300 |
| **TOTAL** | **~20,900** | **~1,900** | **~-19,000** |

Target codebase: ~15,500 lines → further trimmed to ~8,000–10,000 as dead code surfaces during testing.

---

## Modules Surviving the Refocus

### Core Alignment Engine (the actual product)

| Module | Lines | Role |
|--------|-------|------|
| `src/MediatorNode.ts` | ~400 (from 1,528) | Orchestrator — stripped to core cycle only |
| `src/ingestion/IntentIngester.ts` | ~200 | Poll chain for pending intents |
| `src/mapping/VectorDatabase.ts` | ~250 | HNSW index for semantic similarity |
| `src/llm/LLMProvider.ts` | ~400 | LLM negotiation + embedding generation |
| `src/settlement/SettlementManager.ts` | ~300 | Create and submit proposals |
| `src/reputation/ReputationTracker.ts` | ~200 | Track reputation (MP-01) |
| `src/chain/ChainClient.ts` | ~500 (from 787) | NatLangChain API adapter — trim dead methods |
| `src/chain/transformers.ts` | ~450 | Data format translation layer |

### Supporting Infrastructure (keep)

| Module | Lines | Role |
|--------|-------|------|
| `src/types/index.ts` | ~300 (from 800+) | Core types — strip protocol extension types |
| `src/config/ConfigLoader.ts` | ~150 | Environment-based configuration |
| `src/utils/logger.ts` | ~80 | Winston logging |
| `src/utils/crypto.ts` | ~150 | Hashing and signatures |
| `src/utils/circuit-breaker.ts` | ~150 | Fault tolerance for chain calls |
| `src/utils/prompt-security.ts` | ~100 | LLM prompt sanitization |
| `src/validation/schemas.ts` | ~200 (from 420) | Zod schemas — keep core, strip extension schemas |
| `src/cli.ts` | ~100 | CLI interface |
| `src/index.ts` | ~30 | Library exports |

### Estimated Surviving Source: ~4,060 lines core + tests

---

## Phase 0: Preparation and Safety Net

**Duration:** 1 day

**Task 0.1** — Create a dedicated branch: `refocus/core-loop`.

**Task 0.2** — Record test baseline.
```bash
npx jest 2>&1 | tee test_baseline.txt
```
Current baseline: 39/56 suites passing, 1272/1553 tests passing.

**Task 0.3** — Map internal import dependencies. Confirm that cutting modules won't cascade into the core alignment engine. Key check: nothing in `MediatorNode.ts` hard-fails if optional managers are removed (they're already behind feature flags — `config.enableEffortCapture`, `config.enableDisputeSystem`, etc.).

**Task 0.4** — Tag the pre-refocus state: `git tag v0.1.0-alpha-pre-refocus`.

**Exit Criteria:**
- Branch and tag created
- Test baseline recorded
- Import dependency map confirms safe removal order

---

## Phase 1: Cut Dead Modules

**Duration:** 2–3 days
**Target Removal:** ~14,000 lines

These modules implement features that NatLangChain has cut entirely, or that build on infrastructure that does not exist and has no path to existing.

### Task 1.1 — Delete Token/Burn Economics (NatLangChain cut all token economics)

| Module | Lines | NatLangChain Status |
|--------|-------|-------------------|
| `src/burn/BurnManager.ts` | ~300 | NLC cut: `observance_burn.py`, `treasury.py`, `market_pricing.py` |
| `src/burn/BurnAnalytics.ts` | ~250 | No burn analytics on chain |
| `src/burn/LoadMonitor.ts` | ~200 | No load-based burn multipliers on chain |

**Impact:** `MediatorNode.ts` constructor passes `BurnManager` to `IntentIngester` and `SettlementManager`. Refactor these to accept `null` or remove the burn dependency entirely.

### Task 1.2 — Delete Security Apps Integration (NatLangChain cut SIEM/boundary)

| Module | Lines | NatLangChain Status |
|--------|-------|-------------------|
| `src/security/SecurityAppsManager.ts` | ~300 | NLC cut: `boundary_siem.py` |
| `src/security/BoundaryDaemonClient.ts` | ~250 | NLC cut: no boundary daemon |
| `src/security/BoundarySIEMClient.ts` | ~250 | NLC cut: no SIEM |
| `src/security/VulnerabilityScanner.ts` | ~200 | Self-scanning; no operational value |
| `src/security/SecurityTestRunner.ts` | ~200 | Self-testing; belongs in CI, not runtime |
| `src/security/SecurityReportGenerator.ts` | ~150 | No reports without scanner |
| `src/security/SecurityAppsConfig.ts` | ~50 | Config for cut modules |
| `src/security/ErrorHandler.ts` | ~100 | SIEM-dependent error handler |

**Total:** ~1,500 lines. Keep `src/security/index.ts` only if it re-exports something surviving.

### Task 1.3 — Delete WebSocket Real-Time Streaming (no clients exist)

| Module | Lines | Rationale |
|--------|-------|-----------|
| `src/websocket/WebSocketServer.ts` | 986 | Zero connected clients. NatLangChain has no WebSocket support. |
| `src/websocket/EventPublisher.ts` | 572 | No events to publish to nobody. |
| `src/websocket/AuthenticationService.ts` | 306 | Auth for a server nobody connects to. |

**Total:** 1,864 lines.

### Task 1.4 — Delete Governance System (NatLangChain deferred governance)

| Module | Lines | NatLangChain Status |
|--------|-------|-------------------|
| `src/governance/GovernanceManager.ts` | ~300 | NLC governance is deferred. Zero participants. |

### Task 1.5 — Delete Sybil Resistance (NatLangChain has its own rate limiting)

| Module | Lines | Rationale |
|--------|-------|-----------|
| `src/sybil/SubmissionTracker.ts` | ~250 | NatLangChain has `rate_limiter.py` and `entry_quality.py` on-chain. Mediator shouldn't duplicate this. |
| `src/sybil/SpamProofDetector.ts` | ~250 | Spam detection belongs on-chain, not in the mediator. |

### Task 1.6 — Delete Advanced Monitoring (premature for alpha)

| Module | Lines | Rationale |
|--------|-------|-----------|
| `src/monitoring/PerformanceAnalytics.ts` | ~300 | No production workload to analyze. |
| `src/monitoring/MonitoringPublisher.ts` | ~200 | Publishes to WebSocket (which is being cut). |
| `src/monitoring/HealthMonitor.ts` | ~200 | Elaborate health monitoring for a single-node alpha. |

Keep `src/monitoring/HealthServer.ts` (~200 lines) — a basic `/health` endpoint is useful.

### Task 1.7 — Delete NCIP Governance Specs and Protocol Extension Docs

| Files | Count | Rationale |
|-------|-------|-----------|
| `docs/NCIP-000.md` through `docs/NCIP-015.md` | 16 | Governance specifications for zero governance events. NatLangChain's refocus removes this layer. |
| `docs/MP-02-spec.md` through `docs/MP-06-spec.md` | 5 | Specs for protocol extensions being cut/deferred. |

Move to `_deferred/docs/` (Phase 2) rather than delete — these have conceptual value.

### Task 1.8 — Clean `MediatorNode.ts` Constructor

After Phase 1 cuts, remove from the constructor:
- `BurnManager` and `LoadMonitor` initialization (lines 78–81)
- `SecurityAppsManager` and `ErrorHandler` initialization (lines 174–198)
- `WebSocketServer` and `EventPublisher` initialization (lines 139–150)
- `MonitoringPublisher`, `HealthMonitor`, `PerformanceAnalytics` initialization (lines 153–166)
- `GovernanceManager` initialization (lines 169–171)
- `SubmissionTracker` and `SpamProofDetector` initialization (lines 109–110)

Remove from `start()`:
- WebSocket server startup (lines 314–320)
- Monitoring system startup (lines 323–348)
- Governance system startup (lines 347–348)
- Security apps initialization (lines 351–391)
- Sybil resistance monitoring (lines 298–300)
- Load monitoring startup (lines 308–311)

Remove from `stop()`:
- WebSocket server stop (lines 475–481)
- Security apps shutdown (lines 490–496)
- SIEM logging (lines 456–469)
- Monitoring/governance stop (lines 438–453)

Remove from `getStatus()`:
- `loadStats`, `sybilResistanceStats`, `spamProofStats` blocks (lines 1137–1166)
- `validatorRotationStats` (line 1192–1194)

Remove public getters for cut systems (lines 1476–1527).

### Task 1.9 — Clean `src/types/index.ts`

Remove type definitions for:
- Burn-related types (`BurnTransaction`, `BurnRecord`, `BurnStats`, etc.)
- WebSocket types
- Governance types
- Security apps types
- SIEM/Boundary types
- All MP-02 through MP-06 specific types (effort receipts, disputes, licenses, MP-05 settlement)

Keep:
- `ConsensusMode`, `IntentStatus`, `SettlementStatus`
- `Intent`, `ProposedSettlement`, `NegotiationResult`
- `MediatorConfig` (strip cut feature flags)
- `AlignmentCandidate`
- `Challenge` (basic challenge type — needed for reputation)

### Task 1.10 — Delete Test Files for Cut Modules

Remove test files exclusively testing cut modules. Expected list:
- All test files for `burn/`, `security/`, `websocket/`, `governance/`, `sybil/`, `monitoring/` (except HealthServer if tested separately)

### Task 1.11 — Run Tests, Fix Breakage, Commit

**Commit message:** `refocus: cut 14K lines of modules misaligned with NatLangChain post-refocus`

**Exit Criteria:**
- All cut module files deleted
- `MediatorNode.ts` constructor initializes only core managers
- Import references cleaned (no dangling imports)
- Build compiles cleanly (`npm run build`)
- Surviving tests pass

---

## Phase 2: Defer Premature Modules

**Duration:** 1 day
**Target:** ~6,000 lines moved to `_deferred/`

These modules are conceptually aligned with NatLangChain's future roadmap but premature for both projects right now.

### Task 2.1 — Create `_deferred/` Directory

```
_deferred/
├── src/
├── test/
└── docs/
```

### Task 2.2 — Defer Protocol Extensions

| Module | Lines | Deferral Reason | NatLangChain Status |
|--------|-------|-----------------|-------------------|
| `src/effort/` (6 files) | ~1,500 | MP-02 Proof-of-Effort — no consumer exists | NLC deferred: `cognitive_load.py` |
| `src/dispute/` (6 files) | ~1,500 | MP-03 Disputes — no real disputes exist | NLC deferred: `dispute.py` |
| `src/licensing/` (4 files) | ~800 | MP-04 Licensing — no licenses exist | No NLC equivalent |
| `src/settlement/MP05*.ts` (4 files) | ~1,000 | MP-05 extended settlement — core SettlementManager suffices | NLC: 40% implemented, not ready |

### Task 2.3 — Defer Network/Multi-Chain Modules

| Module | Lines | Deferral Reason | NatLangChain Status |
|--------|-------|-----------------|-------------------|
| `src/network/MultiChainOrchestrator.ts` | ~400 | Multi-chain for a single-server chain | NLC deferred: P2P |
| `src/network/MediatorNetworkCoordinator.ts` | ~400 | Distributed mediator coordination — zero mediators | NLC deferred: gossip protocol |

### Task 2.4 — Defer Consensus Complexity

| Module | Lines | Deferral Reason | NatLangChain Status |
|--------|-------|-----------------|-------------------|
| `src/consensus/ValidatorRotationManager.ts` | ~250 | Validator rotation for zero validators | NLC deferred: multi-model consensus |
| `src/consensus/SemanticConsensusManager.ts` | ~300 | Multi-mediator verification — only one mediator exists | NLC deferred |
| `src/mapping/IntentClusteringService.ts` | ~200 | Clustering before basic matching works | Nice-to-have |

### Task 2.5 — Defer Surplus Consensus Modes

The mediator currently implements 4 consensus modes. NatLangChain's post-refocus is a single Flask server with no stake, no authorities, and no validators. Keep only Permissionless mode.

| Module | Lines | Deferral Reason |
|--------|-------|-----------------|
| `src/consensus/StakeManager.ts` | ~200 | DPoS stake — no staking on NatLangChain |
| `src/consensus/AuthorityManager.ts` | ~150 | PoA authorities — no authority set on NatLangChain |

**Impact on MediatorNode.ts:** Remove consensus mode branching from `start()`. Default to permissionless. The config field `consensusMode` remains but only `'permissionless'` is active.

### Task 2.6 — Move Documentation to `_deferred/docs/`

- All 16 NCIP specifications
- MP-02 through MP-06 specs
- `docs/SECURITY_HARDENING.md` (references cut security apps)
- `docs/Validator-Reference-Guide.md` (references deferred validator rotation)

### Task 2.7 — Move Test Files for Deferred Modules

Move to `_deferred/test/`:
- All test files for `effort/`, `dispute/`, `licensing/`, `settlement/MP05*`, `network/`, `consensus/ValidatorRotation*`, `consensus/SemanticConsensus*`, `consensus/StakeManager*`, `consensus/AuthorityManager*`

### Task 2.8 — Clean MediatorNode.ts

After Phase 2, `MediatorNode.ts` should look approximately like this:

```typescript
export class MediatorNode {
  private config: MediatorConfig;
  private ingester: IntentIngester;
  private vectorDb: VectorDatabase;
  private llmProvider: LLMProvider;
  private settlementManager: SettlementManager;
  private reputationTracker: ReputationTracker;
  private challengeDetector: ChallengeDetector;
  private challengeManager: ChallengeManager;

  private isRunning: boolean = false;
  private cycleInterval: NodeJS.Timeout | null = null;
  private embeddingCache: Map<string, number[]> = new Map();

  // ... ~400 lines total
}
```

Eight managers instead of twenty-one.

### Task 2.9 — Commit

**Commit message:** `refocus: defer 6K lines of premature protocol extensions and consensus modes`

**Exit Criteria:**
- `_deferred/` contains all deferred code
- `src/` contains only core alignment engine + supporting infrastructure
- MediatorNode constructor: 8 managers
- Config type: ~15 fields (from 50+)
- Build compiles cleanly
- Surviving tests pass

---

## Phase 3: Fix the Mock Chain

**Duration:** 1 day

The mock chain (`examples/mock-chain/server.js`) uses `/api/v1/*` paths, but NatLangChain's actual API uses `/entry`, `/pending`, `/search/semantic`, `/contract/*` — no `/api/v1/` prefix. The ChainClient correctly targets NatLangChain's actual endpoints. The mock chain is the thing that's wrong.

### Task 3.1 — Rewrite Mock Chain to Match NatLangChain

Replace current routes with NatLangChain-compatible routes:

| Current Mock Route | NatLangChain Actual Route |
|--------------------|--------------------------|
| `GET /api/v1/intents` | `GET /pending` + filter by `is_contract` metadata |
| `POST /api/v1/entries` | `POST /entry` |
| `GET /api/v1/settlements/:id/status` | `POST /search/semantic` with settlement ID |
| `GET /api/v1/reputation/:id` | Keep as-is (reputation is mediator-side) |
| — (missing) | `GET /entries/search?intent=<keyword>` |
| — (missing) | `POST /search/semantic` |
| — (missing) | `GET /contract/list?status=open` |
| — (missing) | `POST /contract/respond` |
| — (missing) | `GET /chain` |

### Task 3.2 — Add Missing Endpoints

The mock chain needs these endpoints that ChainClient calls:
- `GET /pending` — return unmined entries
- `GET /entries/search` — keyword search
- `POST /search/semantic` — basic semantic search (can use string matching for mock)
- `GET /contract/list` — return open contracts
- `POST /contract/respond` — accept contract proposals
- `GET /chain` — return block structure

### Task 3.3 — Keep `/api/v1/` Routes as Aliases (Temporary)

Add the NatLangChain-native routes as primary, keep `/api/v1/` as aliases so existing tests don't break immediately. Mark aliases as deprecated.

### Task 3.4 — Commit

**Commit message:** `fix: realign mock-chain endpoints with NatLangChain actual API surface`

**Exit Criteria:**
- Mock chain responds to NatLangChain's actual endpoint paths
- ChainClient can communicate with mock chain without fallback paths
- Mock chain README updated

---

## Phase 4: Fix Broken Tests

**Duration:** 2–3 days

Currently 17 of 56 test suites fail (281 of 1,553 tests). After Phases 1–2, many of those suites will be deleted (they test cut/deferred modules). The remaining failures are in integration tests where the ChainClient refactor broke axios mocking.

### Task 4.1 — Assess Surviving Test Suites

After Phases 1–2, expected surviving test suites:

**Unit tests (keep):**
- `IntentIngester.test.ts`
- `VectorDatabase.test.ts`
- `LLMProvider.test.ts`
- `SettlementManager.test.ts`
- `ReputationTracker.test.ts`
- `ChallengeDetector.test.ts`
- `ChallengeManager.test.ts`
- `ChainClient.test.ts`
- `ConfigLoader.test.ts`

**Integration tests (keep):**
- `AlignmentCycle.test.ts`
- `SettlementLifecycle.test.ts`

**Cut/moved (from Phase 1 and 2):**
- All burn, security, websocket, governance, sybil, monitoring, effort, dispute, licensing, MP05, consensus-mode-specific, network, and validator rotation test suites

### Task 4.2 — Fix ChainClient Axios Mocking

The root cause of most failures: `ChainClient` is constructed inside other managers (e.g., `BurnManager`, `SettlementManager`) via `ChainClient.fromConfig()`, but tests mock `axios` at the module level. When `ChainClient` creates its own `axios.create()` instance, the mock doesn't intercept it.

**Fix:** In test setup, mock `axios.create` to return a mock axios instance whose methods (`get`, `post`) are jest mocks. This is the standard pattern for testing code that uses `axios.create()`:

```typescript
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      response: { use: jest.fn() },
      request: { use: jest.fn() },
    },
  })),
  get: jest.fn(),
  post: jest.fn(),
  isAxiosError: jest.fn(),
}));
```

### Task 4.3 — Update Integration Tests

`AlignmentCycle.test.ts` and `SettlementLifecycle.test.ts` should test the core four-stage loop with properly mocked chain responses. Remove references to cut subsystems.

### Task 4.4 — Target: 100% of Surviving Suites Pass

After this phase, every remaining test suite should pass. No exceptions.

### Task 4.5 — Commit

**Commit message:** `fix: repair test suite — all surviving suites pass after refocus`

**Exit Criteria:**
- 0 failing test suites
- 0 failing tests
- Build compiles cleanly

---

## Phase 5: Harden the Core Loop

**Duration:** 3–5 days

With the codebase stripped down, invest in making the core alignment engine robust and correctly integrated with NatLangChain.

### Task 5.1 — Make ChainClient the Single Point of Chain Communication

Currently `MediatorNode.ts` makes direct `axios` calls for challenge scanning (`scanForChallengeableSettlements`, line 722) and verification requests (`checkForVerificationRequests`, line 875). These bypass ChainClient entirely.

**Fix:** Move all chain communication through ChainClient. Add methods:
- `getRecentSettlements(limit: number): Promise<ProposedSettlement[]>`
- `getIntentByHash(hash: string): Promise<Intent | null>` (already exists as `getIntent()`)

Remove `import axios from 'axios'` from `MediatorNode.ts`.

### Task 5.2 — Leverage NatLangChain's Contract Matching

NatLangChain has `POST /contract/match` which does autonomous offer/seek matching. The mediator currently duplicates this with its own `VectorDatabase` + `LLMProvider` pipeline. Two approaches:

**Option A (Recommended):** Use NatLangChain's `/contract/match` as a candidate source *in addition to* the mediator's own vector search. The mediator adds value by running deeper LLM negotiation on top of the chain's initial matches.

**Option B:** Replace the mediator's vector search entirely with `/contract/match` calls. Simpler, but removes the mediator's independent semantic analysis — which is its differentiator.

Implement Option A: Add `getMatchCandidates()` to ChainClient that calls `/contract/match`, merge results with local vector search candidates, deduplicate, and feed into the negotiation phase.

### Task 5.3 — Improve Transformer Robustness

`src/chain/transformers.ts` handles NatLangChain ↔ mediator format translation. After refocus, this becomes the critical integration layer. Harden it:
- Add Zod validation to `entryToIntent()` — reject malformed entries early
- Add logging for transformation failures (currently silent)
- Test with actual NatLangChain response formats (use examples from NatLangChain's `API_REFERENCE.md`)

### Task 5.4 — Add Error Recovery to Alignment Cycle

The core `executeAlignmentCycle()` in `MediatorNode.ts` should:
- Log clear metrics: intents processed, candidates found, negotiations attempted, settlements submitted
- Track cycle duration for performance baseline
- Handle LLM API failures gracefully (skip negotiation, don't crash cycle)
- Handle chain unavailability gracefully (skip cycle, log, retry next interval)

### Task 5.5 — Simplify Configuration

After the refocus, `MediatorConfig` should have ~15 fields:

```typescript
interface MediatorConfig {
  // Chain connection
  chainEndpoint: string;
  chainId: string;

  // Identity
  mediatorPublicKey: string;
  mediatorPrivateKey: string;

  // LLM
  llmProvider: 'anthropic' | 'openai';
  llmApiKey: string;
  embeddingProvider?: 'openai' | 'voyage' | 'cohere' | 'fallback';
  embeddingApiKey?: string;
  embeddingModel?: string;

  // Mediation parameters
  facilitationFeePercent: number;
  acceptanceWindowHours: number;
  minNegotiationConfidence: number;

  // Timing
  alignmentCycleIntervalMs?: number;
  intentPollingIntervalMs?: number;
  settlementMonitoringIntervalMs?: number;

  // Vector DB
  vectorDbPath: string;
  vectorDimensions: number;

  // Optional
  enableChallengeSubmission?: boolean;
  logLevel?: string;
}
```

No more 13+ feature flags for subsystems that don't exist.

### Task 5.6 — Commit

**Commit message:** `feat: harden core alignment engine and align with NatLangChain API`

**Exit Criteria:**
- All chain communication goes through ChainClient
- NatLangChain's `/contract/match` integrated as candidate source
- Transformer layer validated against NatLangChain response formats
- Configuration simplified to ~15 fields
- All tests pass

---

## Phase 6: Prove the Cross-Project Loop

**Duration:** 3–5 days

This is the most important phase. Demonstrate that the mediator-node and NatLangChain work together end-to-end.

### Task 6.1 — Create End-to-End Demo Script

Write `demo/cross-project-demo.ts` that:

1. Starts the mock chain (or connects to a running NatLangChain instance)
2. Verifies chain health via `/health`
3. Submits an "offer" intent via `POST /entry`:
   ```
   "I am offering a high-performance Rust library for fluid dynamics simulation.
    400 hours of work. Looking for 500 NLC or equivalent compute time.
    Free for open-source climate models."
   ```
4. Submits a "seek" intent via `POST /entry`:
   ```
   "We need a high-resolution ocean current simulation for climate research.
    Budget of 800 NLC. Must be fast, auditable, and documented in plain English."
   ```
5. Starts the mediator node
6. Waits for one alignment cycle to complete
7. Verifies: intent ingestion occurred, vector embeddings generated, candidates found, LLM negotiation ran, settlement proposed
8. Prints the proposed settlement with reasoning trace
9. Simulates party acceptance
10. Verifies fee collection

This script should run in under 2 minutes and produce clear, readable output showing each phase of the alignment cycle.

### Task 6.2 — Test Against Real NatLangChain (if available)

If NatLangChain's refocus has progressed to Phase 7 (prove the loop), test the mediator against an actual NatLangChain instance. Document:
- Which endpoints work
- Which endpoints need adjustment
- Response format mismatches
- Latency characteristics

### Task 6.3 — Benchmark LLM Costs

Instrument the alignment cycle to log:
- LLM calls per cycle (embedding generation + negotiation)
- Token usage per negotiation
- Cost per settlement proposal
- Cycle latency breakdown (ingestion vs mapping vs negotiation vs submission)

This data is critical for understanding the mediator's economic viability.

### Task 6.4 — Update README.md

Rewrite README to reflect the refocused mediator:
- Remove references to MP-02 through MP-06, 4 consensus modes, governance, security apps, WebSocket streaming
- Focus on: what it does, how to run it, how it connects to NatLangChain
- Include the demo script as the primary "getting started" path
- Add clear "NatLangChain Compatibility" section listing supported endpoints

### Task 6.5 — Update Mock Chain README

Document that the mock chain mimics NatLangChain's post-refocus API surface and link to NatLangChain's `API_REFERENCE.md` as the source of truth.

### Task 6.6 — Tag the Release

```bash
git tag v0.2.0-alpha-focused
```

### Task 6.7 — Coordinate with NatLangChain

File an issue or PR on NatLangChain requesting:
1. Confirmation of post-refocus API endpoints
2. Addition of `/contract/propose` endpoint (the mediator needs a way to submit proposals; currently falls back to `POST /entry`)
3. WebSocket contract stream (deferred, but document the need for NatLangChain's roadmap)

**Commit message:** `feat: add cross-project demo and prove end-to-end alignment loop`

**Exit Criteria:**
- Demo script runs successfully against mock chain
- README reflects refocused scope
- LLM cost metrics documented
- Release tagged

---

## Risk Registry

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| NatLangChain API changes during concurrent refocus | High | Medium | ChainClient's fallback pattern already handles missing endpoints; coordinate via issues |
| Removing BurnManager breaks IntentIngester/SettlementManager | Medium | Low | These accept optional burn dependencies; null-check already in place |
| Deferred modules bitrot in `_deferred/` | High | Low | Acceptable — re-integrate when chain supports them |
| ChainClient axios mocking fix is complex | Medium | Medium | Use `axios.create` mock pattern from Task 4.2; well-documented Jest pattern |
| LLM costs make mediation uneconomical | Medium | High | Phase 6.3 benchmarking will reveal this early |
| Mock chain diverges from real NatLangChain | Medium | Medium | Phase 6.2 tests against real chain; Phase 6.7 coordinates API contract |

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| **Phase 0:** Preparation | 1 day | Branch, baseline, dependency map |
| **Phase 1:** Cut Dead Modules | 2–3 days | Delete ~14K lines misaligned with NatLangChain |
| **Phase 2:** Defer Premature Modules | 1 day | Archive ~6K lines of future-roadmap code |
| **Phase 3:** Fix Mock Chain | 1 day | Align mock endpoints with NatLangChain actual API |
| **Phase 4:** Fix Broken Tests | 2–3 days | All surviving suites pass, axios mocking fixed |
| **Phase 5:** Harden Core Loop | 3–5 days | Single chain adapter, contract match integration, config cleanup |
| **Phase 6:** Prove the Loop | 3–5 days | Cross-project demo, LLM benchmarks, README rewrite, release tag |
| **TOTAL** | **~13–19 days** | **From 34.5K to ~8–10K lines, proven against NatLangChain** |

This timeline is designed to overlap with NatLangChain's 20–30 day refocus. Phase 6 should begin when NatLangChain reaches its Phase 7 (prove the loop), enabling a joint demo.

---

## Alignment with NatLangChain Refocus Phases

| NatLangChain Phase | Mediator-Node Phase | Coordination Point |
|-------------------|--------------------|--------------------|
| Phase 0: Preparation | Phase 0: Preparation | Both tag pre-refocus state |
| Phase 1: Cut modules | Phase 1: Cut dead modules | Both removing token economics, SIEM, enterprise features |
| Phase 2: Defer modules | Phase 2: Defer premature modules | Both deferring disputes, P2P/network, negotiation engine |
| Phase 3: Kill god file | Phase 3: Fix mock chain | Mediator aligns mock with NLC's new blueprint routes |
| Phase 4: Harden core | Phase 5: Harden core loop | Both hardening error handling, persistence, LLM integration |
| Phase 5: Test overhaul | Phase 4: Fix broken tests | Both targeting clean test suites |
| Phase 6: Config cleanup | Phase 5.5: Simplify config | Both simplifying to minimal viable config |
| Phase 7: Prove the loop | Phase 6: Prove cross-project loop | **Joint demo — mediator + NatLangChain end-to-end** |

The final deliverable is a single command that starts NatLangChain, starts the mediator, submits two intents, and shows a proposed settlement. If that doesn't work, nothing else matters.
