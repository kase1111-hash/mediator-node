# NatLangChain Mediator Node

An LLM-powered mediator that discovers, negotiates, and proposes alignments between explicit intents on the [NatLangChain](https://github.com/kase1111-hash/NatLangChain) protocol.

## What It Does

The Mediator Node connects to a NatLangChain instance and runs the **four-stage alignment cycle**:

1. **Ingestion** — Polls the chain for pending intents (human-authored prose describing desired outcomes)
2. **Mapping** — Generates semantic embeddings and finds high-probability alignment candidates
3. **Negotiation** — Runs LLM-simulated dialogue to determine if two intents can be aligned, proposes specific terms
4. **Submission** — Publishes the proposed settlement to the chain with a 72-hour acceptance window

When both parties accept a settlement, the mediator earns a facilitation fee.

## Quick Start

### 1. Prerequisites

- Node.js 18+
- An LLM API key (Anthropic Claude or OpenAI)

### 2. Install

```bash
git clone https://github.com/kase1111-hash/mediator-node.git
cd mediator-node
npm install
npm run build
```

### 3. Run the Demo

The fastest way to see the alignment cycle in action:

```bash
# Terminal 1: Start the mock chain
npm run mock-chain

# Terminal 2: Run the end-to-end demo
npm run demo
```

The demo walks through every phase of the alignment cycle against the mock chain, producing clear output at each step. It works without an LLM API key (using simulated negotiation).

To run with a real LLM:

```bash
ANTHROPIC_API_KEY=your-key npm run demo
```

### 4. Run as a Service

```bash
# Copy and edit the environment config
cp .env.example .env
nano .env

# Start the mediator
npm start
```

### 5. Docker Compose

```bash
export ANTHROPIC_API_KEY=your-key-here
docker-compose up
```

## Configuration

Key environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CHAIN_ENDPOINT` | Yes | — | NatLangChain node URL (or `http://localhost:8545` for mock) |
| `CHAIN_ID` | Yes | — | Chain identifier |
| `LLM_PROVIDER` | No | `anthropic` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | Yes* | — | Anthropic API key (*if provider is anthropic) |
| `OPENAI_API_KEY` | Yes* | — | OpenAI API key (*if provider is openai) |
| `MEDIATOR_PRIVATE_KEY` | Yes | — | Mediator identity private key |
| `MEDIATOR_PUBLIC_KEY` | Yes | — | Mediator identity public key |
| `FACILITATION_FEE_PERCENT` | No | `1.0` | Fee percentage earned on successful settlements |
| `EMBEDDING_PROVIDER` | No | `fallback` | `openai`, `voyage`, `cohere`, or `fallback` |
| `EMBEDDING_API_KEY` | No | — | API key for embedding provider |
| `ALIGNMENT_CYCLE_INTERVAL_MS` | No | `30000` | Alignment cycle interval in milliseconds |
| `MIN_NEGOTIATION_CONFIDENCE` | No | `60` | Minimum LLM confidence score (0-100) |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, or `error` |

> **Note:** The `fallback` embedding provider uses a naive character-based algorithm unsuitable for production. Configure `EMBEDDING_PROVIDER=openai` for production deployments.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MediatorNode                          │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Ingester   │→ │  VectorDB    │→ │  LLMProvider  │  │
│  │  (polling)  │  │  (mapping)   │  │  (negotiate)  │  │
│  └─────────────┘  └──────────────┘  └──────────────┘   │
│          │                                    │         │
│          ▼                                    ▼         │
│  ┌─────────────┐                   ┌──────────────┐    │
│  │  Reputation  │                  │  Settlement   │    │
│  │  Tracker     │                  │  Manager      │    │
│  └─────────────┘                   └──────────────┘    │
│                                           │             │
│  ┌─────────────────────────────────────────┘            │
│  │                                                      │
│  ▼                                                      │
│  ┌──────────────────┐   ┌──────────────────┐           │
│  │   ChainClient    │   │  Challenge       │           │
│  │   (HTTP adapter) │   │  System          │           │
│  └────────┬─────────┘   └──────────────────┘           │
└───────────┼─────────────────────────────────────────────┘
            │
            ▼
   NatLangChain Node
   (POST /entry, GET /pending, POST /contract/propose, ...)
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **MediatorNode** | Orchestrates the four-stage alignment cycle |
| **IntentIngester** | Polls chain for pending intents, validates and caches them |
| **VectorDatabase** | HNSW index for fast semantic similarity search |
| **LLMProvider** | Anthropic/OpenAI integration for embeddings and negotiation |
| **SettlementManager** | Creates settlements, submits to chain, monitors acceptance |
| **ChainClient** | Single HTTP adapter for all NatLangChain API communication |
| **ReputationTracker** | Tracks mediator reputation per MP-01 formula |
| **ChallengeDetector** | Analyzes settlements for contradictions |
| **ChallengeManager** | Submits and monitors challenges |

## NatLangChain Compatibility

The mediator communicates with NatLangChain through `ChainClient`, which uses these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Chain health check |
| `/pending` | GET | Fetch pending unmined entries |
| `/entry` | POST | Submit entries (intents, settlements, challenges) |
| `/entries/search` | GET | Keyword search for entries |
| `/entries/author/:author` | GET | Get entries by author |
| `/search/semantic` | POST | Meaning-based search |
| `/contract/list` | GET | List contracts by status |
| `/contract/propose` | POST | Submit contract/settlement proposal |
| `/contract/respond` | POST | Accept or reject a contract |
| `/contract/payout` | POST | Claim facilitation fee payout |
| `/contract/match` | POST | Find matching contracts (supplements local vector search) |
| `/chain` | GET | Full blockchain data |
| `/validate/chain` | GET | Chain integrity validation |
| `/stats` | GET | Chain statistics |
| `/reputation/:id` | GET | Load mediator reputation |
| `/reputation` | POST | Update mediator reputation |

All endpoints include circuit breaker protection and retry logic with exponential backoff.

## Testing

```bash
# Run all tests (13 suites, 408 tests)
npm test

# Build
npm run build

# Lint
npm run lint
```

## Project Structure

```
mediator-node/
├── src/
│   ├── MediatorNode.ts     # Main orchestrator (~500 lines)
│   ├── chain/              # ChainClient + NatLangChain transformers
│   ├── ingestion/          # Intent polling and validation
│   ├── mapping/            # Vector database (HNSW similarity search)
│   ├── llm/                # LLM provider (Anthropic/OpenAI)
│   ├── settlement/         # Settlement creation and monitoring
│   ├── reputation/         # Reputation tracking (MP-01)
│   ├── challenge/          # Challenge detection and management
│   ├── monitoring/         # Health server
│   ├── config/             # Configuration loading
│   ├── validation/         # Input validation (Zod schemas)
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Crypto, logging, circuit breaker
├── test/                   # Test suite (13 suites, 408 tests)
├── demo/                   # Cross-project demo script
├── examples/mock-chain/    # Mock NatLangChain server for development
└── package.json
```

## Reputation System

Mediator reputation follows the MP-01 formula:

```
Weight = (Successful_Closures + Failed_Challenges * 2) / (1 + Upheld_Challenges_Against + Forfeited_Fees)
```

Higher reputation improves consensus selection priority and challenge auditing authority.

## Fee Structure

Facilitation fees are earned when:
1. Both parties accept the proposed settlement
2. No upheld challenges exist during the acceptance window
3. Settlement closes successfully

The fee is calculated as a percentage (`FACILITATION_FEE_PERCENT`) of the total offered fees from both parties.

## License

MIT License — see [LICENSE](./LICENSE)

---

**Built for the NatLangChain protocol**
*Intent over Form. Radical Neutrality. The Refusal of Shadow.*

Post intent. Let the system find alignment.
