# Production Readiness Checklist

A comprehensive checklist for deploying NatLangChain Mediator Node to production.

## Executive Summary

The mediator-node codebase is approximately **80-85% production-ready**. This document identifies specific gaps that should be addressed before production deployment.

---

## Critical Issues (Must Fix Before Production)

### 1. Missing Global Error Handlers

**Location**: `src/cli.ts` (lines 32-42)

**Issue**: No handlers for `unhandledRejection` and `uncaughtException` - background async tasks may crash silently.

**Current Code**:
```typescript
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await node.stop();  // No try/catch or timeout
  process.exit(0);
});
```

**Fix Required**:
```typescript
// Add at the top of start command
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

// Add timeout to shutdown handlers
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);
  try {
    await node.stop();
    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
});
```

- [ ] Add unhandledRejection handler
- [ ] Add uncaughtException handler
- [ ] Add shutdown timeout (30 seconds)
- [ ] Wrap shutdown in try/catch

---

### 2. Missing WebSocket Rate Limiting

**Location**: `src/websocket/WebSocketServer.ts`

**Issue**: No per-connection message rate limiting. A single client can spam messages and degrade service.

**Current State**: Only message size limit (100KB) exists.

**Fix Required**: Add per-connection message rate limiting:

```typescript
// Add to handleMessage():
const MAX_MESSAGES_PER_SECOND = 100;
if (now - connection.messageWindow > 1000) {
  connection.messageCount = 0;
  connection.messageWindow = now;
}
if (++connection.messageCount > MAX_MESSAGES_PER_SECOND) {
  ws.close(1008, 'Rate limit exceeded');
  return;
}
```

- [ ] Add message rate limiting per connection
- [ ] Add rate limit configuration options
- [ ] Log rate limit violations

---

### 3. Missing Chain Health Checker

**Location**: `src/MediatorNode.ts` (health checker registration section)

**Issue**: No health check for ChainClient connectivity. Node might be disconnected from blockchain but continue running.

**Fix Required**:
```typescript
this.healthMonitor.registerComponent(
  'chainClient',
  async () => ({
    name: 'chainClient',
    status: await this.chainClient.checkHealth() ? 'healthy' : 'unhealthy',
    message: 'Chain connectivity status',
    lastCheck: Date.now(),
  })
);
```

- [ ] Register chain health checker
- [ ] Add connectivity check to ChainClient
- [ ] Test health check under network failures

---

### 4. Optional Feature Configuration Validation

**Location**: `src/config/ConfigLoader.ts` (lines 206-229)

**Issue**: When optional features are enabled, their required configs aren't validated.

**Examples**:
- `ENABLE_DISPUTE_SYSTEM=true` doesn't validate dispute system requirements
- `ENABLE_SYBIL_RESISTANCE=true` doesn't validate sybil resistance parameters
- Security app tokens not validated when services enabled

**Fix Required**: Add feature-flag-specific validation:
```typescript
if (config.enableDisputeSystem && !config.maxClarificationDays) {
  throw new Error('ENABLE_DISPUTE_SYSTEM=true requires MAX_CLARIFICATION_DAYS');
}
```

- [ ] Validate dispute system configuration when enabled
- [ ] Validate sybil resistance configuration when enabled
- [ ] Validate security app tokens when enabled
- [ ] Validate effort capture configuration when enabled

---

## High Priority Issues

### 5. Missing MediatorNode Unit Tests

**Location**: `src/MediatorNode.ts` (1,350+ lines)

**Issue**: Main orchestration class lacks dedicated unit tests. Only tested through integration tests.

- [ ] Create `test/unit/MediatorNode.test.ts`
- [ ] Test start() and stop() lifecycle
- [ ] Test alignment cycle execution
- [ ] Test error recovery in monitoring loops

---

### 6. Missing Correlation IDs for Distributed Tracing

**Issue**: No correlation IDs for cross-component request tracking.

**Impact**: Difficult to trace a single intent through the entire pipeline.

- [ ] Add correlationId to major operations
- [ ] Pass correlationId through ingester → llmProvider → settlementManager
- [ ] Log correlationId in all relevant places

---

### 7. Missing Interval Backoff Strategies

**Locations**:
- `src/MediatorNode.ts` (lines 554-602) - settlement/challenge monitoring
- `src/ingestion/IntentIngester.ts` (lines 31-52) - polling

**Issue**: setInterval callbacks have try/catch but intervals aren't cleared on repeated failures. Failed operations retry forever without backoff.

- [ ] Implement exponential backoff for repeated failures
- [ ] Add circuit breaker for background intervals
- [ ] Clear intervals after N consecutive failures

---

### 8. Missing Health Checkers for Optional Systems

**Issue**: Optional systems lack health checkers when enabled.

- [ ] Add Settlement System health checker (MP-05)
- [ ] Add Dispute System health checker (MP-03)
- [ ] Add Effort Capture System health checker (MP-02)
- [ ] Add Licensing System health checker (MP-04)
- [ ] Add Governance System health checker

---

## Medium Priority Issues

### 9. Security Apps Token Validation

**Location**: `src/security/SecurityAppsConfig.ts`

**Issue**: No validation that tokens are set when services enabled.

- [ ] Validate BOUNDARY_DAEMON_TOKEN when BOUNDARY_DAEMON_ENABLED=true
- [ ] Validate BOUNDARY_SIEM_TOKEN when BOUNDARY_SIEM_ENABLED=true

---

### 10. API Key Exposure in Logs

**Location**: `src/chain/ChainClient.ts` (lines 94-99)

**Issue**: Error logging includes full error objects which may contain API key details.

- [ ] Sanitize error.config before logging
- [ ] Create sanitizeForLogging() utility function

---

### 11. Default Wildcard CORS

**Location**: `src/websocket/WebSocketServer.ts` (line 142)

**Issue**: Default allowedOrigins set to `['*']`.

- [ ] Require explicit origin configuration
- [ ] Remove wildcard default
- [ ] Document origin configuration

---

### 12. Circuit Breaker Testing

**Location**: `src/utils/circuit-breaker.ts`

**Issue**: No dedicated unit tests.

- [ ] Create `test/unit/utils/circuit-breaker.test.ts`
- [ ] Test state transitions
- [ ] Test failure thresholds

---

## Documentation Gaps

### 13. Missing Configuration Reference

- [ ] Create detailed CONFIGURATION.md with all 120+ options
- [ ] Document DPoS vs PoA vs Hybrid mode selection
- [ ] Document burn parameters
- [ ] Document load scaling thresholds

---

### 14. Missing API Documentation

**Location**: `docs/API.md`

- [ ] Add WebSocket message schema examples
- [ ] Add error response codes and formats
- [ ] Add authentication flow examples
- [ ] Document rate limit response headers

---

## Testing Gaps

### 15. Test Coverage

| Component | Coverage | Status |
|-----------|----------|--------|
| MediatorNode | Low | Needs unit tests |
| EventPublisher | Partial | Expand tests |
| CircuitBreaker | None | Create tests |
| BoundaryDaemonClient | None | Add integration tests |
| BoundarySIEMClient | None | Add integration tests |
| MP05SettlementValidator | None | Add tests |

---

## Checklist Summary

### Before Production (Critical)

| # | Item | Status |
|---|------|--------|
| 1 | Add global error handlers | [ ] |
| 2 | Add WebSocket rate limiting | [ ] |
| 3 | Add chain health checker | [ ] |
| 4 | Add optional feature validation | [ ] |

### High Priority (Within 1 Sprint)

| # | Item | Status |
|---|------|--------|
| 5 | Create MediatorNode unit tests | [ ] |
| 6 | Add correlation IDs | [ ] |
| 7 | Implement interval backoff | [ ] |
| 8 | Add missing health checkers | [ ] |

### Medium Priority (Within 2 Sprints)

| # | Item | Status |
|---|------|--------|
| 9 | Security apps token validation | [ ] |
| 10 | Sanitize error logs | [ ] |
| 11 | Fix default CORS | [ ] |
| 12 | Circuit breaker tests | [ ] |
| 13 | Configuration documentation | [ ] |
| 14 | API documentation | [ ] |
| 15 | Improve test coverage | [ ] |

---

## Production Deployment Pre-Flight

Before deploying to production, verify:

```bash
# 1. Run all tests with coverage
npm test -- --coverage

# 2. Verify coverage thresholds (80% minimum)
# Check jest.config.js thresholds are met

# 3. Run linting
npm run lint

# 4. Build production bundle
npm run build

# 5. Test graceful shutdown
node dist/cli.js start &
PID=$!
sleep 5
kill -TERM $PID
# Verify clean shutdown in logs

# 6. Verify health endpoints
curl http://localhost:8081/health
curl http://localhost:8081/health/live
curl http://localhost:8081/health/ready

# 7. Run benchmarks
npm run benchmark
```

---

## Security Pre-Flight

- [ ] Private keys NOT in .env (use vault)
- [ ] Health port not exposed publicly
- [ ] WebSocket auth enabled (`authRequired: true`)
- [ ] Rate limiting configured
- [ ] Log level set to `info` (not `debug`)
- [ ] Container runs as non-root
- [ ] Network policies restrict egress
- [ ] Secrets rotation scheduled

---

## Monitoring Pre-Flight

- [ ] Alerts configured for health endpoint 503
- [ ] Alerts configured for container restarts
- [ ] Alerts configured for high error rates
- [ ] Alerts configured for LLM quota exhaustion
- [ ] Log aggregation configured
- [ ] Metrics collection configured

---

*Last Updated: 2026-01-01*
