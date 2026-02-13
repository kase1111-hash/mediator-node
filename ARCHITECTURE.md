# Mediator Node Architecture

## Overview

The NatLangChain Mediator Node is built as a modular, event-driven system that implements the four-stage Alignment Cycle described in the MP-01 protocol specification.

## System Design

### Core Principles

1. **Separation of Concerns**: Each module handles a specific aspect of mediation
2. **Asynchronous Operations**: All I/O operations are non-blocking
3. **Stateless Mediation**: Each alignment cycle is independent
4. **Extensibility**: Consensus modes are pluggable components
5. **Auditability**: All actions produce traceable logs

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MediatorNode                                   │
│                          (Main Orchestrator)                                │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
  ┌─────▼─────┐         ┌──────▼──────┐        ┌─────▼──────┐
  │ Alignment │         │  Settlement │        │  WebSocket │
  │   Cycle   │         │   Monitor   │        │   Server   │
  └─────┬─────┘         └──────┬──────┘        └─────┬──────┘
        │                      │                     │
   ┌────┴──────────────────────┼─────────────────────┼──────┐
   │                           │                     │      │
┌──▼─────┐ ┌──────────┐ ┌──────▼──────┐ ┌───────────▼┐ ┌───▼──────┐
│Ingester│ │Vector DB │ │   LLM       │ │ Settlement │ │  Health  │
│        │ │  (HNSW)  │ │  Provider   │ │  Manager   │ │  Server  │
└───┬────┘ └────┬─────┘ └─────┬───────┘ └─────┬──────┘ └──────────┘
    │           │             │               │
    │    ┌──────┴─────────────┼───────────────┤
    │    │                    │               │
┌───▼────▼────────────────────▼───────────────▼───────────────────┐
│                        Chain API Client                         │
└─────────────────────────────────────────────────────────────────┘
        │
┌───────┴───────────────────────────────────────────────────────┐
│                     Protocol Extension Managers               │
├───────────────┬───────────────┬───────────────┬──────────────┤
│ BurnManager   │ DisputeManager│ EffortCapture │ Licensing    │
│ (MP-06)       │ (MP-03)       │ (MP-02)       │ (MP-04)      │
└───────────────┴───────────────┴───────────────┴──────────────┘
```

## Component Details

### 1. MediatorNode (Orchestrator)

**Responsibility**: Coordinates the alignment cycle and manages component lifecycle

**Key Operations**:
- Initialize all subsystems
- Run alignment cycle timer (30-second intervals)
- Monitor settlements (60-second intervals)
- Handle graceful shutdown
- Provide status reporting

**State**:
- `isRunning`: Boolean flag for operational status
- `cycleInterval`: Timer for alignment cycles
- `embeddingCache`: In-memory cache of intent vectors

### 2. IntentIngester

**Responsibility**: Monitor blockchain and maintain local intent cache

**Key Operations**:
- Poll chain API for new intents (10-second intervals)
- Validate intent structure and content
- Parse desires and constraints from prose
- Filter unalignable intents
- Enforce cache size limits (10,000 intents max)

**State**:
- `intentCache`: Map of hash → Intent
- `lastPollTime`: Timestamp of last successful poll
- `pollingInterval`: Timer reference

**Intent Validation Rules**:
1. Must have valid hash, author, and prose
2. Prose must be ≥10 characters
3. Must not contain prohibited patterns
4. Must not exceed flag threshold (5 flags)
5. Must be sufficiently clear (≥50 characters recommended)

### 3. VectorDatabase

**Responsibility**: Semantic search using HNSW vector index

**Key Operations**:
- Initialize/load HNSW index
- Add intent embeddings
- Find K-nearest neighbors
- Save index to disk
- Manage intent-to-vector mapping

**Implementation**:
- Uses `hnswlib-node` for fast approximate nearest neighbor search
- Cosine similarity metric
- Configurable dimensions (default: 1536 for OpenAI embeddings)
- Persistent storage in `vector-db/` directory

**Performance**:
- O(log N) search complexity
- Handles 10,000+ intents efficiently
- Memory-efficient lazy loading

### 4. LLMProvider

**Responsibility**: Interface with LLM APIs for negotiation and embeddings

**Key Operations**:
- Generate embeddings for intent text
- Run negotiation simulations
- Generate semantic summaries
- Calculate model integrity hashes

**Supported Providers**:
- **Anthropic Claude**: For negotiation (no native embeddings)
- **OpenAI**: For both negotiation and embeddings
- **Custom**: Extensible for other providers

**Negotiation Prompt Structure**:
```
1. Present both intents with metadata
2. Request semantic alignment analysis
3. Enforce constraint validation
4. Request structured output (SUCCESS, CONFIDENCE, REASONING, TERMS)
5. Apply protocol principles (Intent over Form, Radical Neutrality, Refusal of Shadow)
```

**Response Parsing**:
- Regex-based extraction of key fields
- JSON parsing for proposed terms
- Confidence threshold: ≥60 for success
- Fallback handling for malformed responses

### 5. SettlementManager

**Responsibility**: Create, submit, and monitor proposed settlements

**Key Operations**:
- Create settlement from negotiation result
- Format as prose entry
- Submit to chain API
- Monitor acceptance status
- Handle closure and fee claims
- Track challenges

**Settlement Lifecycle**:
```
Created → Proposed → [Accepted by A] → [Accepted by B] → Closed
                  → [Challenged] → [Upheld/Rejected]
                  → [Expired]
```

**Acceptance Window**:
- Permissionless: 72 hours (default)
- PoA: 24 hours (fast finality)
- Configurable via `ACCEPTANCE_WINDOW_HOURS`

### 6. ReputationTracker

**Responsibility**: Track and update mediator reputation metrics

**Key Operations**:
- Load reputation from chain
- Record successful closures
- Record failed challenges
- Record upheld challenges against
- Record forfeited fees
- Recalculate weight using MP-01 formula
- Publish updates to chain

**Reputation Formula**:
```
Weight = (Successful_Closures + Failed_Challenges × 2) /
         (1 + Upheld_Challenges_Against + Forfeited_Fees)
```

**Chain Integration**:
- Reads from reputation chain endpoint
- Publishes updates after each event
- Maintains local cache for performance

### 7. StakeManager (DPoS)

**Responsibility**: Manage bonded stake and delegations

**Key Operations**:
- Bond/unbond stake
- Load delegations from chain
- Calculate effective stake
- Check minimum stake requirements
- Handle slashing events

**Effective Stake Calculation**:
```
Effective Stake = Own Bonded Stake + Sum(Active Delegations)
```

**Unbonding Period**: 30 days (configurable)

### 8. AuthorityManager (PoA)

**Responsibility**: Manage authority set and authorization

**Key Operations**:
- Load authority set from chain
- Verify mediator authorization
- Check if public keys are authorities
- Request authorization via governance

**PoA Checks**:
- On startup: Verify mediator is in authority set
- Before submission: Validate authority signature
- During monitoring: Track authority set changes

### 9. ValidatorRotationManager (DPoS)

**Responsibility**: Implement slot-based validator rotation for DPoS consensus

**Key Operations**:
- Epoch initialization and transitions (24-hour epochs by default)
- Stake-weighted validator selection (top N validators)
- Round-robin slot assignment within epochs (10-minute slots)
- Missed slot tracking and validator jailing
- Unjail cooldown enforcement (24 hours)
- Slot-based mediation gating

**Epoch Lifecycle**:
```
Epoch Start → Select Top N Validators → Assign Slots → Monitor Activity → Epoch End
     ↑                                                                        ↓
     └────────────────────────────────────────────────────────────────────────┘
```

**Slot Assignment**:
```
Within Epoch:
  Slot 0: Validator[0]  (t=0 to t=10min)
  Slot 1: Validator[1]  (t=10min to t=20min)
  Slot 2: Validator[2]  (t=20min to t=30min)
  ...
  Slot N: Validator[0]  (Round-robin wraps)
```

**Jailing Mechanics**:
- Validators track consecutive missed slots
- After 3 missed slots (configurable): Auto-jail
- 24-hour cooldown before unjailing allowed
- Unjailing resets missed slot counter

**Configuration**:
- `activeSlots`: Number of active validator slots (default: 21)
- `rotationPeriodHours`: Epoch duration (default: 24)
- `slotDurationMinutes`: Slot length (default: 10)
- `minStakeForRotation`: Minimum stake requirement
- `jailThreshold`: Missed slots before jailing (default: 3)
- `unjailCooldownHours`: Cooldown period (default: 24)

## Data Flow

### Alignment Cycle Flow

```
1. INGESTION
   ↓
   IntentIngester polls chain API
   ↓
   Validates and caches intents
   ↓
2. MAPPING
   ↓
   LLMProvider generates embeddings
   ↓
   VectorDatabase adds vectors
   ↓
   VectorDatabase finds K-NN candidates
   ↓
3. NEGOTIATION
   ↓
   LLMProvider simulates dialogue
   ↓
   Produces NegotiationResult
   ↓
4. SUBMISSION
   ↓
   SettlementManager creates settlement
   ↓
   Adds consensus metadata (stake/signature)
   ↓
   Submits to chain API
```

### Settlement Monitoring Flow

```
SettlementManager.monitorSettlements()
   ↓
   For each active settlement:
   ↓
   Query chain API for status
   ↓
   Check partyA/partyB acceptance
   ↓
   Check for challenges
   ↓
   If both accepted + no upheld challenges:
      → Close settlement
      → Claim fee
      → Update reputation (+1 closure)
   ↓
   If challenged and upheld:
      → Forfeit fee
      → Update reputation (+1 forfeited)
      → Slash stake (if DPoS)
   ↓
   If expired without acceptance:
      → Mark as rejected
      → Remove from active list
```

## Consensus Mode Adaptations

### Permissionless Mode
- **No prerequisites**: Can start immediately
- **Reputation-only**: Weight based on history
- **Open participation**: Anyone can run a mediator

### DPoS Mode
- **Prerequisites**:
  - Bond minimum stake via StakeManager
  - Meet `MIN_EFFECTIVE_STAKE` requirement
- **Enhancements**:
  - Load delegations on startup
  - Include stake reference in settlements
  - Handle slashing events
  - Distribute portion of fees to delegators

### PoA Mode
- **Prerequisites**:
  - Public key must be in authority set
  - Configure `POA_AUTHORITY_KEY`
- **Enhancements**:
  - Load authority set on startup
  - Sign all settlements with authority key
  - Fast 24-hour acceptance window
  - No stake requirements

### Hybrid Mode
- **Combines**: PoA authorization + DPoS rotation
- **Example**:
  - Only authorities can mediate (PoA)
  - Rotation order determined by stake (DPoS)
  - Governance weighted by stake (DPoS)

## Performance Characteristics

### Throughput
- **Intent Ingestion**: 100 intents per 10-second poll
- **Alignment Cycle**: 3 candidates per 30-second cycle
- **Settlement Monitoring**: All active settlements per 60 seconds

### Scalability
- **Intent Cache**: Up to 10,000 intents
- **Vector Database**: Efficient up to 100,000+ intents
- **Concurrent Settlements**: No hard limit (API-dependent)

### Resource Usage
- **Memory**: ~200-500 MB (depends on cache size)
- **Disk**: Vector database + logs (~100 MB per 10K intents)
- **Network**: Moderate (polling + API calls)
- **CPU**: Spike during LLM calls, low otherwise

## Error Handling

### Retry Strategies
- **Chain API failures**: Logged, continue next cycle
- **LLM API failures**: Return failure result, continue
- **Vector DB failures**: Throws on init, logs on operation

### Graceful Degradation
- **No embeddings**: Uses fallback (basic text features)
- **No reputation data**: Starts with default weight (1.0)
- **No delegations**: Uses own stake only

### Fault Tolerance
- **Vector DB corruption**: Reinitialize from scratch
- **Cache overflow**: Evict oldest intents
- **API timeouts**: Skip cycle, retry next interval

## Configuration

### Environment Variables

**Required**:
- `CHAIN_ENDPOINT`
- `CHAIN_ID`
- `MEDIATOR_PRIVATE_KEY`
- `MEDIATOR_PUBLIC_KEY`
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

**Optional** (with defaults):
- `CONSENSUS_MODE` (default: permissionless)
- `FACILITATION_FEE_PERCENT` (default: 1.0)
- `VECTOR_DIMENSIONS` (default: 1536)
- `MAX_INTENTS_CACHE` (default: 10000)
- `ACCEPTANCE_WINDOW_HOURS` (default: 72)
- `LOG_LEVEL` (default: info)

### Tunable Parameters

**Performance Tuning**:
- Polling interval: 10 seconds default (`INTENT_POLLING_INTERVAL_MS`)
- Cycle interval: 30 seconds default (`ALIGNMENT_CYCLE_INTERVAL_MS`)
- Monitor interval: 60 seconds default (`SETTLEMENT_MONITORING_INTERVAL_MS`)
- Top candidates per cycle: 3 (hardcoded)

**Quality Tuning**:
- Similarity threshold: 0.5 (hardcoded in VectorDatabase)
- Confidence threshold: 60 default (`MIN_NEGOTIATION_CONFIDENCE`)
- Max flag count: 5 default (`MAX_INTENT_FLAGS`)

## Security

### Cryptographic Operations
- **Signature generation**: SHA-256 hash + private key
- **Verification**: Hash comparison (placeholder for ECDSA)
- **Model integrity**: SHA-256 of model + prompt
- **Intent hashing**: SHA-256 of prose + author + timestamp

### Input Validation
- Intent prose length limits
- Prohibited content filtering
- Signature verification on chain responses
- Fee percentage bounds (0-100%)

### Access Control
- Private key protection (env variables)
- PoA authority set enforcement
- Stake requirement validation
- API endpoint authentication (chain-dependent)

## Extensibility

### Adding New LLM Providers

1. Extend `LLMProvider` class
2. Implement `generateEmbedding()` method
3. Implement `negotiateAlignment()` method
4. Add provider to `getLLMProvider()` in ConfigLoader

### Adding New Consensus Modes

1. Create manager in `src/consensus/`
2. Implement initialization in `MediatorNode.start()`
3. Add metadata to settlements in `SettlementManager`
4. Update `ConsensusMode` type in `src/types/`

### Custom Chain Integrations

Implement API client for:
- Intent fetching
- Entry submission
- Status querying
- Reputation tracking

Replace axios calls in respective managers.

### 10. WebSocketServer

**Responsibility**: Real-time event streaming to connected clients

**Key Operations**:
- Accept authenticated WebSocket connections
- Publish events for intents, settlements, disputes, receipts
- Support topic-based subscriptions with filters
- Maintain heartbeat for connection health

**Configuration**:
- `port`: WebSocket server port (default: 8080)
- `authRequired`: Require authentication (default: true)
- `authTimeout`: Authentication timeout (default: 30s)
- `maxConnections`: Connection limit (default: 1000)

### 11. HealthServer

**Responsibility**: Provide HTTP health endpoints for monitoring

**Endpoints**:
- `/health`: Full health report with component status
- `/health/live`: Kubernetes liveness probe
- `/health/ready`: Kubernetes readiness probe

**Health Components Monitored**:
- Vector database status and latency
- Chain client connectivity
- LLM provider availability
- Memory and CPU usage

### 12. BurnManager (MP-06)

**Responsibility**: Token burn economics and behavioral pressure

**Key Operations**:
- Calculate filing burn amounts
- Track daily free submission allowances
- Apply exponential burn escalation
- Integrate with LoadMonitor for load-scaled pricing
- Record success burns on closure

**Burn Formula**:
```
Burn = BaseBurn × EscalationMultiplier × LoadMultiplier
EscalationMultiplier = base^(dailySubmissions - freeLimit)
```

### 13. DisputeManager (MP-03)

**Responsibility**: Settlement dispute lifecycle management

**Components**:
- `ClarificationManager`: Request/receive clarifications
- `EvidenceManager`: Evidence submission and freezing
- `EscalationManager`: Escalation to human review
- `OutcomeRecorder`: Record dispute resolutions

**Dispute Lifecycle**:
```
Initiated → Clarifying → Under Review → [Resolved | Dismissed | Escalated]
```

### 14. EffortCaptureSystem (MP-02)

**Responsibility**: Track and anchor proof-of-effort receipts

**Observers**:
- `CommandObserver`: Terminal command tracking
- `SignalObserver`: System signal detection
- `TextEditObserver`: Editor activity monitoring

**Key Operations**:
- Capture effort signals in real-time
- Segment effort into temporal windows
- Generate cryptographic receipts
- Anchor receipts to blockchain

### 15. LicensingManager (MP-04)

**Responsibility**: License and delegation management

**Key Operations**:
- Create and ratify licenses
- Track license expiry and scope
- Manage delegations
- Detect scope violations
- Handle license revocation

### 16. GovernanceManager

**Responsibility**: Stake-weighted governance voting

**Key Operations**:
- Submit governance proposals
- Tally stake-weighted votes
- Execute approved proposals
- Track proposal lifecycle

**Proposal Lifecycle**: 7-day voting → quorum check → approval → 3-day delay → execution

### 17. SemanticConsensusManager

**Responsibility**: Multi-mediator verification for high-value settlements

**Key Operations**:
- Identify settlements above value threshold
- Select random verifier mediators
- Collect independent verification votes
- Require consensus percentage for closure

### 18. ChallengeManager

**Responsibility**: Settlement challenge submission and tracking

**Key Operations**:
- Submit challenges with evidence
- Track challenge status
- Record challenge outcomes
- Update reputation based on results

### 19. SecurityTestRunner

**Responsibility**: Automated security vulnerability scanning

**Key Operations**:
- Run vulnerability scans against components
- Generate security reports
- Track security test history
- Alert on critical findings

## Future Enhancements

### Under Consideration
- Machine learning for candidate prioritization
- Advanced embedding models (fine-tuned for intents)
- Distributed mediator coordination for high availability
- Intent clustering for batch mediation optimization
- Cross-chain intent bridging
