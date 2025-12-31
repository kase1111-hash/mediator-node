# Operations Runbook

This document provides operational guidance for deploying and maintaining the NatLangChain Mediator Node in production.

## Table of Contents

- [Deployment](#deployment)
- [Configuration](#configuration)
- [Health Monitoring](#health-monitoring)
- [Common Operations](#common-operations)
- [Troubleshooting](#troubleshooting)
- [Backup and Recovery](#backup-and-recovery)

---

## Deployment

### Prerequisites

- Node.js >= 18.0.0
- Docker and Docker Compose (optional)
- Access to NatLangChain RPC endpoint
- LLM API key (Anthropic or OpenAI)

### Docker Deployment (Recommended)

```bash
# Clone and configure
git clone <repository>
cd mediator-node
cp .env.example .env
# Edit .env with your configuration

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f mediator-node
```

### Manual Deployment

```bash
# Install dependencies
npm install

# Build
npm run build

# Initialize configuration
npm run init

# Start
npm run start
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHAIN_ENDPOINT` | Yes | NatLangChain RPC URL |
| `CHAIN_ID` | Yes | Chain identifier |
| `LLM_PROVIDER` | Yes | `anthropic` or `openai` |
| `LLM_API_KEY` | Yes | API key for LLM provider |
| `MEDIATOR_PRIVATE_KEY` | Yes | Private key for signing |
| `FACILITATION_FEE_PERCENT` | No | Fee percentage (default: 0.01) |
| `HEALTH_PORT` | No | Health check port (default: 8081) |
| `WS_PORT` | No | WebSocket port (default: 9000) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |

---

## Configuration

### Consensus Modes

```yaml
# Permissionless (default) - Pure Proof-of-Alignment
consensusMode: permissionless

# DPoS - Delegated Proof-of-Stake
consensusMode: dpos
bondedStakeAmount: 1000

# PoA - Proof-of-Authority (permissioned)
consensusMode: poa
poaAuthorityKey: <authority-key>
```

### Vector Database

The mediator uses HNSW for semantic search. Configure in `.env`:

```bash
VECTOR_DB_PATH=./data/vectors
VECTOR_DIMENSIONS=1536
MAX_INTENTS_CACHE=10000
```

---

## Health Monitoring

### Health Endpoints

The HealthServer exposes HTTP endpoints on the configured health port:

| Endpoint | Purpose | Success Code |
|----------|---------|--------------|
| `GET /health` | Full health report | 200 (healthy/degraded), 503 (unhealthy) |
| `GET /health/live` | Liveness probe | 200 (always, if process running) |
| `GET /health/ready` | Readiness probe | 200 (ready), 503 (not ready) |

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8081
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8081
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Docker Health Check

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8081/health/ready"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

### Health Report Example

```json
{
  "status": "healthy",
  "timestamp": 1704067200000,
  "uptime": 86400000,
  "resources": {
    "cpu": 15.2,
    "memory": { "used": 256, "total": 1024 },
    "disk": { "used": 10, "total": 100 }
  },
  "components": {
    "vectorDb": { "status": "healthy", "latency": 5 },
    "chainClient": { "status": "healthy", "latency": 120 },
    "llmProvider": { "status": "healthy", "latency": 250 }
  }
}
```

---

## Common Operations

### Viewing Logs

```bash
# Docker
docker-compose logs -f mediator-node

# Systemd
journalctl -u mediator-node -f

# Log files (if configured)
tail -f /var/log/mediator-node/app.log
```

### Checking Status

```bash
# CLI status command
npm run status

# Health endpoint
curl http://localhost:8081/health | jq

# WebSocket connections
curl http://localhost:9000/
```

### Graceful Restart

```bash
# Docker
docker-compose restart mediator-node

# Systemd
systemctl restart mediator-node

# Manual (sends SIGTERM for graceful shutdown)
kill -TERM <pid>
```

### Scaling Considerations

- **Vector DB Size**: Monitor `data/vectors` directory size
- **Memory Usage**: HNSW index is memory-resident; scale RAM with intent volume
- **Connection Limits**: Configure `maxConnections` for WebSocket server
- **Rate Limiting**: Adjust burn economics for high-load scenarios

---

## Troubleshooting

### High Memory Usage

**Symptoms**: OOM kills, slow responses

**Actions**:
1. Check vector DB size: `vectorDb.getStats()`
2. Reduce `MAX_INTENTS_CACHE`
3. Increase container memory limits
4. Check for memory leaks in logs

### LLM Timeouts

**Symptoms**: Negotiations failing, slow alignment cycles

**Actions**:
1. Check LLM provider status page
2. Verify API key validity
3. Check rate limits
4. Consider fallback provider

### Chain Connectivity Issues

**Symptoms**: Intents not ingesting, settlements failing

**Actions**:
1. Verify `CHAIN_ENDPOINT` is accessible
2. Check chain sync status
3. Verify mediator key has sufficient funds
4. Check firewall rules

### Vector Search Degradation

**Symptoms**: Poor alignment matches, slow searches

**Actions**:
1. Check index size vs configured max
2. Run benchmark: `npm run benchmark`
3. Consider rebuilding index if corrupted
4. Verify embedding dimensions match model

### WebSocket Connection Issues

**Symptoms**: Clients disconnecting, auth failures

**Actions**:
1. Check `authTimeout` configuration
2. Verify client clock sync (for signatures)
3. Check max connections limit
4. Review firewall/proxy settings

---

## Backup and Recovery

### What to Backup

| Data | Location | Frequency |
|------|----------|-----------|
| Vector DB | `data/vectors/` | Daily |
| Settlements | `data/settlements/` | Continuous |
| Disputes | `data/disputes/` | Continuous |
| Configuration | `.env`, config files | On change |

### Backup Commands

```bash
# Create backup
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Restore backup
tar -xzf backup-20240101.tar.gz
```

### Recovery Procedure

1. Stop the mediator node
2. Restore data from backup
3. Verify data integrity
4. Restart the mediator node
5. Check health endpoints
6. Monitor logs for errors

### Disaster Recovery

If data is lost:
1. The vector DB can be rebuilt from chain data
2. Pending settlements may need re-negotiation
3. Active disputes require manual review
4. Reputation scores are stored on-chain (recoverable)

---

## Monitoring Metrics

### Key Metrics to Track

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| CPU Usage | > 70% | > 90% |
| Memory Usage | > 80% | > 95% |
| Vector DB Size | > 80% max | > 95% max |
| Alignment Cycle Time | > 60s | > 120s |
| LLM Latency p99 | > 5s | > 10s |
| Settlement Success Rate | < 80% | < 60% |

### Alerting Recommendations

Configure alerts for:
- Health endpoint returning 503
- Container restarts
- High error rates in logs
- Settlement failures
- LLM quota exhaustion

---

## Security Checklist

- [ ] Private keys stored in secure vault (not in `.env`)
- [ ] Health port not exposed publicly
- [ ] WebSocket auth enabled in production
- [ ] Rate limiting configured
- [ ] Log level set to `info` or higher (not `debug`)
- [ ] Container runs as non-root user
- [ ] Network policies restrict egress
- [ ] Secrets rotated regularly
