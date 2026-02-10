# API Documentation

Complete API reference for the NatLangChain Mediator Node.

## Table of Contents

- [HTTP Endpoints](#http-endpoints)
- [WebSocket API](#websocket-api)
- [WebSocket Events](#websocket-events)
- [ChainClient API](#chainclient-api)
- [Configuration](#configuration)

---

## HTTP Endpoints

### Health Server

Base URL: `http://localhost:{HEALTH_PORT}` (default: 8081)

#### GET /health

Full health report with system metrics.

**Response** `200 OK` | `503 Service Unavailable`

```json
{
  "status": "healthy | degraded | unhealthy",
  "timestamp": 1704067200000,
  "uptime": 86400000,
  "version": "1.0.0",
  "resources": {
    "cpu": 15.2,
    "memory": { "used": 256, "total": 1024, "percentage": 25 },
    "disk": { "used": 10, "total": 100, "percentage": 10 }
  },
  "components": {
    "vectorDb": { "status": "healthy", "latency": 5 },
    "chainClient": { "status": "healthy", "latency": 120 },
    "llmProvider": { "status": "healthy", "latency": 250 }
  },
  "metrics": {
    "totalIntents": 1500,
    "totalSettlements": 45,
    "activeConnections": 12,
    "errorRate": 0.02
  }
}
```

#### GET /health/live

Kubernetes liveness probe. Returns 200 if process is running.

**Response** `200 OK`

```json
{
  "status": "alive",
  "timestamp": 1704067200000
}
```

#### GET /health/ready

Kubernetes readiness probe. Returns 200 if ready to accept traffic.

**Response** `200 OK` | `503 Service Unavailable`

```json
{
  "status": "ready | not_ready",
  "health": "healthy | degraded | unhealthy",
  "timestamp": 1704067200000
}
```

---

## WebSocket API

### Connection

```
ws://localhost:{WS_PORT}
```

Default port: 9000

### Authentication

If `authRequired: true` (default), clients must authenticate within `authTimeout` (default: 30s).

**Request:**
```json
{
  "action": "authenticate",
  "identity": "user-public-key",
  "timestamp": 1704067200000,
  "signature": "base64-encoded-signature",
  "nonce": "unique-nonce-string"
}
```

**Response:**
```json
{
  "type": "system.node_status_changed",
  "payload": {
    "success": true,
    "connectionId": "conn-123",
    "message": "Authentication successful"
  }
}
```

### Subscriptions

Subscribe to specific event types with optional filters.

**Subscribe Request:**
```json
{
  "action": "subscribe",
  "topics": ["intent.submitted", "settlement.proposed"],
  "filters": {
    "parties": ["user-123"],
    "intentHashes": ["hash-abc"],
    "settlementIds": ["settlement-xyz"]
  }
}
```

**Response:**
```json
{
  "type": "system.node_status_changed",
  "payload": {
    "success": true,
    "subscriptionId": "sub-456",
    "activeSubscriptions": [
      {
        "subscriptionId": "sub-456",
        "topics": ["intent.submitted", "settlement.proposed"],
        "filters": { "parties": ["user-123"] }
      }
    ]
  }
}
```

**Unsubscribe Request:**
```json
{
  "action": "unsubscribe",
  "subscriptionId": "sub-456"
}
```

**Update Subscription:**
```json
{
  "action": "update",
  "subscriptionId": "sub-456",
  "topics": ["intent.submitted", "intent.accepted"],
  "filters": {
    "parties": ["user-123", "user-456"]
  }
}
```

### Subscription Filters

| Filter | Type | Description |
|--------|------|-------------|
| `parties` | `string[]` | Filter by party identifiers |
| `intentHashes` | `string[]` | Filter by intent hashes |
| `settlementIds` | `string[]` | Filter by settlement IDs |
| `receiptIds` | `string[]` | Filter by receipt IDs |
| `disputeIds` | `string[]` | Filter by dispute IDs |
| `licenseIds` | `string[]` | Filter by license IDs |
| `delegationIds` | `string[]` | Filter by delegation IDs |
| `minSeverity` | `string` | Minimum event severity |

---

## WebSocket Events

### Message Format

All events follow this structure:

```json
{
  "type": "event.type",
  "eventId": "unique-event-id",
  "timestamp": 1704067200000,
  "version": "1.0",
  "payload": { }
}
```

### Intent Events

| Event | Description |
|-------|-------------|
| `intent.submitted` | New intent submitted to chain |
| `intent.accepted` | Intent accepted for alignment |
| `intent.rejected` | Intent rejected |
| `intent.closed` | Intent closed/completed |
| `intent.unalignable` | Intent cannot be aligned |

**Payload:**
```json
{
  "intent": {
    "hash": "intent-hash",
    "author": "user-pubkey",
    "prose": "Natural language intent...",
    "desires": ["outcome1", "outcome2"],
    "constraints": ["constraint1"],
    "offeredFee": 100,
    "timestamp": 1704067200000,
    "status": "pending"
  },
  "previousStatus": "pending"
}
```

### Settlement Events

| Event | Description |
|-------|-------------|
| `settlement.proposed` | Settlement proposal created |
| `settlement.accepted` | Party accepted settlement |
| `settlement.rejected` | Party rejected settlement |
| `settlement.challenged` | Settlement challenged |
| `settlement.closed` | Settlement finalized |

**Payload:**
```json
{
  "settlement": {
    "id": "settlement-id",
    "intentHashA": "hash-a",
    "intentHashB": "hash-b",
    "proposedTerms": { },
    "status": "proposed"
  },
  "previousStatus": "proposed",
  "party": "user-pubkey"
}
```

### MP-05 Settlement Events

| Event | Description |
|-------|-------------|
| `mp05.settlement.initiated` | MP-05 settlement started |
| `mp05.settlement.declared` | Party declaration submitted |
| `mp05.settlement.ratified` | Settlement ratified |
| `mp05.settlement.finalized` | Settlement finalized |
| `mp05.settlement.contested` | Settlement contested |
| `mp05.settlement.reversed` | Settlement reversed |
| `mp05.settlement.stage_completed` | Stage completed |

### Dispute Events (MP-03)

| Event | Description |
|-------|-------------|
| `dispute.initiated` | Dispute filed |
| `dispute.under_review` | Under mediator review |
| `dispute.clarifying` | Clarification requested |
| `dispute.escalated` | Escalated to authority |
| `dispute.resolved` | Dispute resolved |
| `dispute.dismissed` | Dispute dismissed |
| `dispute.evidence_submitted` | Evidence added |
| `dispute.clarification_provided` | Clarification received |

### Receipt Events (MP-02)

| Event | Description |
|-------|-------------|
| `receipt.created` | Effort receipt created |
| `receipt.validated` | Receipt validated |
| `receipt.anchored` | Receipt anchored to chain |
| `receipt.verified` | Receipt verified |
| `receipt.signal_added` | Signal added to receipt |
| `receipt.segment_completed` | Effort segment completed |

### License Events (MP-04)

| Event | Description |
|-------|-------------|
| `license.proposed` | License proposed |
| `license.ratified` | License ratified |
| `license.active` | License activated |
| `license.expired` | License expired |
| `license.revoked` | License revoked |
| `license.violation_detected` | Scope violation detected |

### Delegation Events (MP-04)

| Event | Description |
|-------|-------------|
| `delegation.proposed` | Delegation proposed |
| `delegation.ratified` | Delegation ratified |
| `delegation.active` | Delegation active |
| `delegation.expired` | Delegation expired |
| `delegation.revoked` | Delegation revoked |
| `delegation.action_delegated` | Action delegated |

### Burn Events (MP-06)

| Event | Description |
|-------|-------------|
| `burn.executed` | Burn transaction executed |
| `burn.escalated` | Burn escalated |
| `burn.load_scaled` | Load-based scaling applied |
| `burn.success_burn` | Success burn applied |

### Challenge Events

| Event | Description |
|-------|-------------|
| `challenge.submitted` | Challenge submitted |
| `challenge.upheld` | Challenge upheld |
| `challenge.rejected` | Challenge rejected |

### System Events

| Event | Description |
|-------|-------------|
| `system.node_status_changed` | Node status changed |
| `system.health_update` | Health status update |
| `system.metrics_snapshot` | Performance metrics |
| `system.load_pressure_changed` | Load pressure changed |
| `system.config_updated` | Configuration updated |

---

## ChainClient API

The ChainClient interfaces with the NatLangChain RPC endpoint.

### Intent Operations

#### getPendingIntents(options?)

Get pending intents from chain.

```typescript
const intents = await chainClient.getPendingIntents({
  author: 'user-pubkey',      // Filter by author
  status: 'pending',          // Filter by status
  since: 1704067200000,       // After timestamp
  limit: 100,                 // Max results
  topK: 20,                   // Semantic top-K
  minScore: 0.7               // Min similarity score
});
```

#### getIntent(hash)

Get specific intent by hash.

```typescript
const intent = await chainClient.getIntent('intent-hash-123');
// Returns Intent | null
```

#### submitIntent(intent, burnTransaction?)

Submit new intent to chain.

```typescript
const result = await chainClient.submitIntent({
  hash: 'generated-hash',
  author: 'user-pubkey',
  prose: 'I want to trade...',
  desires: ['outcome1'],
  constraints: ['constraint1'],
  offeredFee: 100,
  timestamp: Date.now(),
  status: 'pending'
});
// Returns { success: boolean, hash?: string, error?: string }
```

### Settlement Operations

#### getOpenContracts()

Get open contracts for mediation.

```typescript
const contracts = await chainClient.getOpenContracts();
// Returns ProposedSettlement[]
```

#### submitSettlement(settlement)

Submit settlement proposal.

```typescript
const result = await chainClient.submitSettlement(settlement);
// Returns { success: boolean, error?: string }
```

#### getSettlementStatus(settlementId)

Get settlement status.

```typescript
const status = await chainClient.getSettlementStatus('settlement-123');
// Returns { partyAAccepted, partyBAccepted, challenges, status }
```

### Challenge Operations

#### submitChallenge(challenge)

Submit challenge to settlement.

```typescript
const result = await chainClient.submitChallenge({
  settlementId: 'settlement-123',
  challenger: 'user-pubkey',
  reason: 'Constraint violation',
  evidence: { ... }
});
// Returns { success: boolean, challengeId?: string, error?: string }
```

#### getChallengeStatus(challengeId)

Get challenge status.

```typescript
const status = await chainClient.getChallengeStatus('challenge-456');
// Returns { status: 'pending' | 'upheld' | 'rejected' }
```

### Burn Operations

#### submitBurn(burnData)

Submit burn transaction.

```typescript
const result = await chainClient.submitBurn({
  type: 'intent_filing',
  author: 'user-pubkey',
  amount: 50,
  intentHash: 'intent-hash',
  multiplier: 1.5
});
// Returns { success: boolean, transactionId?: string, error?: string }
```

### Search Operations

#### searchSemantic(query, options?)

Semantic search of chain entries.

```typescript
const results = await chainClient.searchSemantic('trading services', {
  topK: 10,
  minScore: 0.7
});
// Returns NatLangChainEntry[]
```

---

## Configuration

### WebSocketServerConfig

```typescript
interface WebSocketServerConfig {
  port: number;                    // Required: WebSocket port
  host?: string;                   // Default: '0.0.0.0'
  authRequired?: boolean;          // Default: true
  authTimeout?: number;            // Default: 30000 (ms)
  heartbeatInterval?: number;      // Default: 30000 (ms)
  maxConnections?: number;         // Default: 1000
  allowedOrigins?: string[];       // Default: ['*']
  enableCompression?: boolean;     // Default: true
}
```

### HealthServerConfig

```typescript
interface HealthServerConfig {
  port: number;                    // Required: Health check port
  host?: string;                   // Default: '0.0.0.0'
}
```

### ChainClientConfig

```typescript
interface ChainClientConfig {
  chainEndpoint: string;           // Required: RPC URL
  mediatorPublicKey: string;       // Required: Mediator identity
  mediatorPrivateKey?: string;     // For signing transactions
  timeout?: number;                // Request timeout (ms)
  retryAttempts?: number;          // Retry count
  retryDelay?: number;             // Delay between retries (ms)
}
```

### WebSocketSubscription

```typescript
interface WebSocketSubscription {
  subscriptionId: string;
  topics: WebSocketEventType[];
  filters?: {
    parties?: string[];
    intentHashes?: string[];
    settlementIds?: string[];
    receiptIds?: string[];
    disputeIds?: string[];
    licenseIds?: string[];
    delegationIds?: string[];
    minSeverity?: 'info' | 'warning' | 'error' | 'critical';
  };
}
```

---

## Error Handling

### HTTP Errors

| Status | Description |
|--------|-------------|
| `200` | Success |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Authentication required |
| `404` | Not Found - Resource doesn't exist |
| `405` | Method Not Allowed |
| `500` | Internal Server Error |
| `503` | Service Unavailable - Unhealthy |

### WebSocket Errors

Error events are sent with type `system.node_status_changed`:

```json
{
  "type": "system.node_status_changed",
  "payload": {
    "success": false,
    "error": "Error message",
    "code": "ERROR_CODE"
  }
}
```

### ChainClient Errors

All methods return error information in the result:

```typescript
{
  success: false,
  error: 'Error description'
}
```

---

## Rate Limits

Default rate limits (configurable):

| Resource | Limit |
|----------|-------|
| WebSocket connections | 1000 per server |
| Intent submissions | Subject to burn economics |
| API requests | No hard limit (chain-dependent) |

---

## Versioning

API version is included in WebSocket event messages:

```json
{
  "version": "1.0",
  ...
}
```

Breaking changes will increment the major version.
