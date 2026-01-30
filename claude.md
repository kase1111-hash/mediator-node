# NatLangChain Mediator Node

## Project Overview

This is an LLM-powered deal matching and negotiation service implementing the MP-01 mediator protocol. The mediator node connects to a NatLangChain blockchain and autonomously:

- Monitors the blockchain for pending user intents (natural language prose)
- Generates semantic embeddings and identifies alignment candidates between intent pairs
- Simulates multi-turn LLM-based negotiation between matched intents
- Proposes settlements to the blockchain when viable agreements are discovered
- Earns facilitation fees when both parties accept settlements

## Tech Stack

- **Language**: TypeScript 5.7+ (strict mode)
- **Runtime**: Node.js 18+
- **LLM Providers**: Anthropic Claude SDK, OpenAI SDK
- **Vector Search**: hnswlib-node (HNSW index)
- **Validation**: Zod schemas
- **Testing**: Jest with ts-jest
- **Linting**: ESLint 9 with TypeScript ESLint

## Key Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm start            # Start mediator node
npm run dev          # Development mode with hot reload
npm test             # Run all tests
npm run lint         # Run ESLint
npm run mock-chain   # Start mock blockchain for testing
npm run docker:up    # Start with docker-compose
```

## Project Structure

```
src/
├── MediatorNode.ts       # Main orchestrator - the core entry point
├── cli.ts                # CLI interface (start/status/init commands)
├── index.ts              # Library exports
├── types/                # TypeScript interfaces and type definitions
├── config/               # Configuration loading (ConfigLoader)
├── chain/                # NatLangChain API client (ChainClient)
├── ingestion/            # Intent monitoring and validation
├── mapping/              # Vector database & semantic similarity search
├── llm/                  # LLM provider integration (Anthropic, OpenAI)
├── settlement/           # Settlement creation & MP-05 coordination
├── reputation/           # Reputation tracking (MP-01)
├── consensus/            # DPoS, PoA, validator rotation
├── challenge/            # Challenge detection & management
├── dispute/              # MP-03 dispute system
├── effort/               # MP-02 proof-of-effort
├── burn/                 # MP-06 token burn economics
├── licensing/            # MP-04 licensing & delegation
├── governance/           # Stake-weighted governance voting
├── sybil/                # Sybil resistance & spam detection
├── websocket/            # Real-time event streaming
├── monitoring/           # Health server & performance analytics
├── security/             # Automated vulnerability scanning
├── network/              # Multi-chain orchestration
└── utils/                # Crypto, logging, circuit breaker

test/
├── unit/                 # Unit tests by domain
├── integration/          # Integration test suites
├── e2e/                  # End-to-end tests
└── fixtures/             # Test data and mocks

docs/
├── MP-02-spec.md through MP-06-spec.md  # Protocol extensions
└── NCIP-*.md             # Semantic governance specs
```

## Architecture

### Core Alignment Cycle (4 stages)

1. **Ingestion** - Poll blockchain for pending intents, validate and cache
2. **Mapping** - Generate embeddings, index in vector DB, find similar pairs
3. **Negotiation** - Run multi-turn LLM dialogue to find agreement
4. **Submission** - Create and submit settlement proposal to chain

The cycle runs every 30 seconds, processing up to 3 candidates per cycle.

### Key Classes

- `MediatorNode` - Main orchestrator that coordinates all components
- `IntentIngester` - Polls blockchain for new intents
- `VectorDatabase` - HNSW-based similarity search
- `LLMProvider` - Abstracts Claude/OpenAI for negotiations
- `SettlementManager` - Handles settlement lifecycle
- `ReputationTracker` - Calculates mediator reputation scores
- `StakeManager` - DPoS stake management
- `AuthorityManager` - PoA authorization
- `ConfigLoader` - Environment configuration

### Consensus Modes

- `permissionless` - Pure Proof-of-Alignment
- `dpos` - Delegated Proof-of-Stake
- `poa` - Proof-of-Authority
- `hybrid` - Combined modes

## Code Conventions

- **Strict TypeScript** - All types must be explicit
- **Winston logging** - Use structured logs with appropriate levels
- **Zod validation** - Runtime schema validation for external inputs
- **Interface-driven** - Core interfaces defined in `src/types/index.ts`
- **Async/await** - Non-blocking I/O throughout
- **Circuit breaker** - Graceful degradation on failures

## Testing

Tests are organized by domain in `test/unit/` and `test/integration/`. Run specific tests with:

```bash
npm test -- path/to/test.ts
npm test -- --coverage
```

80% coverage threshold is enforced for branches, functions, lines, and statements.

## Configuration

Copy `.env.example` to `.env` and set:

- `CHAIN_ENDPOINT` - NatLangChain node URL (required)
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` - LLM credentials (required)
- `MEDIATOR_PRIVATE_KEY` - Mediator identity key (required)
- `MEDIATOR_PUBLIC_KEY` - Mediator public key (required)
- `CONSENSUS_MODE` - One of: permissionless, dpos, poa, hybrid
- `VECTOR_DB_PATH` - Path for HNSW index persistence

## Documentation

- `README.md` - Quick start and overview
- `ARCHITECTURE.md` - Detailed system design
- `INTEGRATION.md` - API integration guide
- `OPERATIONS.md` - Production deployment
- `docs/` - Protocol specs (MP-02 through MP-06) and governance (NCIP-*)
