# Refocus Dependency Map

Generated during Phase 0 of the refocus plan. This document confirms the safe removal order for cut and deferred modules.

## Test Baseline (Pre-Refocus)

```
Test Suites: 18 failed, 38 passed, 56 total
Tests:       283 failed, 1270 passed, 1553 total
Time:        20.048 s
```

Root causes of failure:
- **ChainClient axios mocking** — `axios.create()` returns undefined in test environments where `axios` is mocked at module level but `create` is not handled. Affects 15+ integration suites.
- **Winston logger transport** — `DailyRotateFile` constructor crashes in test setup for `SubmissionTracker.test.ts`.
- **OutcomeRecorder persistence** — file path issue in `OutcomeRecorder.test.ts`.

## Core Modules (MUST survive)

| Module | External Dependencies on CUT/DEFERRED |
|--------|---------------------------------------|
| `src/MediatorNode.ts` | 19 imports from CUT/DEFERRED — ALL must be cleaned |
| `src/ingestion/IntentIngester.ts` | BurnManager (CUT) — **optional param**, safe to remove |
| `src/settlement/SettlementManager.ts` | BurnManager (CUT) + SemanticConsensusManager (DEFERRED) — **both optional params**, safe to remove |
| `src/monitoring/HealthServer.ts` | HealthMonitor (CUT) — **required param**, must refactor |
| `src/index.ts` | StakeManager + AuthorityManager (DEFERRED) — re-exports, must remove |
| `src/mapping/index.ts` | IntentClusteringService (DEFERRED) — re-export, must remove |
| All other core modules | **Clean** — no dependencies on CUT/DEFERRED |

## Critical Hazard

**HealthServer requires HealthMonitor as a mandatory constructor parameter.** HealthMonitor is targeted for cutting.

**Resolution:** Refactor `HealthServer` to provide a standalone `/health` endpoint with basic status reporting (isRunning, uptime, cachedIntents, activeSettlements) without the elaborate component-health-checking system. This keeps the CORE health functionality and drops ~200 lines of HealthMonitor.

## CUT Modules — Safe Removal Confirmed

| Module | Imported By (outside its directory) | Safe? |
|--------|-------------------------------------|-------|
| `src/burn/BurnManager.ts` | MediatorNode (line 11), IntentIngester (line 4, optional), SettlementManager (line 10, optional) | YES — remove imports + optional params |
| `src/burn/BurnAnalytics.ts` | BurnManager only (internal) | YES — goes with BurnManager |
| `src/burn/LoadMonitor.ts` | MediatorNode (line 12) | YES — remove import |
| `src/security/SecurityAppsManager.ts` | MediatorNode (line 28), WebSocketServer (line 17, also CUT) | YES |
| `src/security/ErrorHandler.ts` | MediatorNode (line 29) | YES |
| `src/security/*` (remaining) | Internal to security/ only | YES — trivial |
| `src/websocket/WebSocketServer.ts` | MediatorNode (line 22) | YES |
| `src/websocket/EventPublisher.ts` | MediatorNode (line 23), MonitoringPublisher (also CUT) | YES |
| `src/websocket/AuthenticationService.ts` | WebSocketServer (internal, also CUT) | YES |
| `src/governance/GovernanceManager.ts` | MediatorNode (line 27) | YES |
| `src/sybil/SubmissionTracker.ts` | MediatorNode (line 16) | YES |
| `src/sybil/SpamProofDetector.ts` | MediatorNode (line 17) | YES |
| `src/monitoring/HealthMonitor.ts` | MediatorNode (line 24), **HealthServer (line 9, REQUIRED)** | YES — but must refactor HealthServer first |
| `src/monitoring/PerformanceAnalytics.ts` | MediatorNode (line 25), MonitoringPublisher (also CUT) | YES |
| `src/monitoring/MonitoringPublisher.ts` | MediatorNode (line 26) | YES |

## DEFERRED Modules — Safe Removal Confirmed

| Module | Imported By (outside its directory) | Safe? |
|--------|-------------------------------------|-------|
| `src/effort/*` (6 files) | MediatorNode (line 18, conditional), MP05* (also DEFERRED) | YES |
| `src/dispute/*` (6 files) | MediatorNode (line 19, conditional), MP05* (also DEFERRED) | YES |
| `src/licensing/*` (4 files) | MediatorNode (line 20, conditional), MP05* (also DEFERRED) | YES |
| `src/settlement/MP05*.ts` (4 files) | MediatorNode (line 21, conditional) | YES |
| `src/network/*` (2 files + index) | **Nothing** — zero external consumers | YES — trivial |
| `src/consensus/ValidatorRotationManager.ts` | MediatorNode (line 10, conditional) | YES |
| `src/consensus/SemanticConsensusManager.ts` | MediatorNode (line 15), SettlementManager (line 11, optional) | YES — remove optional param |
| `src/consensus/StakeManager.ts` | MediatorNode (line 8), index.ts (line 19), GovernanceManager (CUT) | YES — remove re-export |
| `src/consensus/AuthorityManager.ts` | MediatorNode (line 9), index.ts (line 20) | YES — remove re-export |
| `src/mapping/IntentClusteringService.ts` | **Nothing** — zero external consumers | YES — trivial |

## ChainClient Status

**Completely clean.** `src/chain/ChainClient.ts` imports only from: axios, types, logger, crypto, circuit-breaker, transformers. No dependencies on any CUT or DEFERRED module.

## Recommended Removal Order

1. **Phase 1a:** Cut `src/security/*`, `src/websocket/*`, `src/governance/*`, `src/sybil/*`, `src/monitoring/PerformanceAnalytics.ts`, `src/monitoring/MonitoringPublisher.ts` — zero cross-dependencies between these and core (except through MediatorNode.ts imports).
2. **Phase 1b:** Refactor `HealthServer` to remove `HealthMonitor` dependency, then cut `src/monitoring/HealthMonitor.ts`.
3. **Phase 1c:** Cut `src/burn/*` — requires removing optional `burnManager` param from IntentIngester and SettlementManager.
4. **Phase 1d:** Clean `MediatorNode.ts` — remove all 11 CUT module imports and corresponding constructor/start/stop/getStatus code.
5. **Phase 2a:** Move `src/effort/*`, `src/dispute/*`, `src/licensing/*`, `src/settlement/MP05*.ts`, `src/network/*` to `_deferred/`.
6. **Phase 2b:** Move `src/consensus/ValidatorRotationManager.ts`, `SemanticConsensusManager.ts`, `StakeManager.ts`, `AuthorityManager.ts` to `_deferred/`. Remove SemanticConsensusManager optional param from SettlementManager.
7. **Phase 2c:** Clean `src/index.ts` (remove StakeManager/AuthorityManager re-exports) and `src/mapping/index.ts` (remove IntentClusteringService re-export).
8. **Phase 2d:** Clean `MediatorNode.ts` — remove all 8 DEFERRED module imports and corresponding code.

## Files Requiring Edits During Phases 1–2

| File | Edits Needed |
|------|-------------|
| `src/MediatorNode.ts` | Remove 19 imports, strip constructor to 8 managers, strip start/stop/getStatus |
| `src/ingestion/IntentIngester.ts` | Remove BurnManager import (line 4) and optional param (line 19) |
| `src/settlement/SettlementManager.ts` | Remove BurnManager import (line 10), SemanticConsensusManager import (line 11), both optional params |
| `src/monitoring/HealthServer.ts` | Refactor: remove HealthMonitor dependency, add standalone health logic |
| `src/index.ts` | Remove StakeManager + AuthorityManager re-exports (lines 19–20) |
| `src/mapping/index.ts` | Remove IntentClusteringService re-export |
| `src/types/index.ts` | Strip types for cut/deferred systems (burn, websocket, governance, MP-02–06, etc.) |
| `src/config/ConfigLoader.ts` | Strip feature flag loading for cut/deferred systems |
