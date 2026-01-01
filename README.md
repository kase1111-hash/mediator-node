# NatLangChain Mediator Node

A lightweight, dedicated node that discovers, negotiates, and proposes alignments between explicit intents on the NatLangChain protocol.

## Purpose

The Mediator Node is a standalone service that:
- Connects to one or more NatLangChain instances (local or remote)
- Runs LLM-powered mediation (matching, negotiation, closure proposals)
- Performs "mining" by submitting successful mediation blocks
- Earns facilitation fees when settlements are accepted
- Requires no buying/selling logic — **pure mediation service**

## Features

### Core Capabilities
- **Intent Ingestion**: Monitors the blockchain for pending intents
- **Semantic Mapping**: Uses vector embeddings to find high-probability alignments
- **LLM Negotiation**: Simulates multi-turn dialogue to find viable settlements
- **Settlement Proposals**: Publishes proposed settlements to the chain
- **Fee Collection**: Claims facilitation fees when both parties accept

### Consensus Modes
- **Permissionless** (default): Pure Proof-of-Alignment + Reputation
- **DPoS**: Delegated Proof-of-Stake with governance voting
- **PoA**: Proof-of-Authority for permissioned environments
- **Hybrid**: Configurable combinations (e.g., PoA + DPoS)

### Advanced Features
- Receipt-based reputation system (MP-01)
- Stake and delegation management
- Challenge window for contradiction proofs
- Semantic consensus verification for high-value settlements
- Governance proposal handling with stake-weighted voting
- Multi-chain orchestration support

### Protocol Extensions (Fully Implemented)
- **MP-02**: Proof-of-Effort Receipt Protocol - Temporal effort tracking
- **MP-03**: Dispute & Escalation System - Clarification, evidence, and escalation
- **MP-04**: Licensing & Delegation Protocol - License management and delegation
- **MP-05**: Settlement & Capitalization Protocol - Settlement coordination
- **MP-06**: Behavioral Pressure & Anti-Entropy Controls - Token burn economics

### Infrastructure
- Real-time WebSocket event streaming
- Health monitoring with Kubernetes-compatible probes
- Automated security vulnerability scanning
- Performance benchmarking and analytics
- Log rotation with daily archive
- CI/CD with GitHub Actions

## Quick Start

Get running in under 5 minutes with Docker Compose:

```bash
# Clone and enter repository
git clone https://github.com/kase1111-hash/mediator-node.git
cd mediator-node

# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Start mock chain + mediator
docker-compose up
```

Watch it work:
```bash
docker-compose logs -f mediator-node
```

## Installation

### Prerequisites
- Node.js 18+
- NatLangChain node access (API endpoint) or use our [mock chain](./examples/mock-chain)
- LLM API key (Anthropic Claude or OpenAI)
- Optional: Bonded stake (for DPoS) or authority key (for PoA)

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/kase1111-hash/mediator-node.git
cd mediator-node
```

2. **Install dependencies**
```bash
npm install
```

3. **Initialize configuration**
```bash
npm run init
```

4. **Edit `.env` file**
```bash
# Edit with your settings
nano .env
```

Key configuration variables:
- `CHAIN_ENDPOINT`: Your NatLangChain node URL (or `http://localhost:8545` for mock)
- `CONSENSUS_MODE`: permissionless | dpos | poa | hybrid
- `LLM_PROVIDER`: anthropic | openai
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`: Your API key
- `MEDIATOR_PRIVATE_KEY`: Your mediator identity
- `FACILITATION_FEE_PERCENT`: Fee percentage (e.g., 1.0 for 1%)

5. **Build the project**
```bash
npm run build
```

## Usage

### Option 1: Docker Compose (Recommended for Testing)

Start everything with one command:

```bash
# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Start mock chain + mediator
docker-compose up
```

The system will start a mock chain with example intents and begin the alignment cycle automatically.

### Option 2: Local Development

**Terminal 1** - Start mock chain (for testing):
```bash
npm run mock-chain
```

**Terminal 2** - Start the mediator:
```bash
npm start
```

### Other Commands

```bash
# Check mediator status
npm run status

# Development mode with hot reload
npm run dev

# Start with custom config
node dist/cli.js start --config ./my-config.env

# Run as daemon
node dist/cli.js start --daemon

# Docker commands
npm run docker:up      # Start with Docker
npm run docker:logs    # View logs
npm run docker:down    # Stop
```

## Architecture

The Mediator Node implements the **four-stage Alignment Cycle**:

### 1. Ingestion Phase
- Polls NatLangChain for new pending intents
- Validates intent structure and content
- Filters out "unalignable" entries (vague, coercive, prohibited)
- Maintains local cache of active intents (up to 10,000)

### 2. Mapping Phase
- Generates semantic embeddings using LLM
- Stores vectors in HNSW index for fast similarity search
- Identifies high-probability pairwise alignments
- Prioritizes by offered fees and similarity scores

### 3. Negotiation Phase (Internal Simulation)
- Runs multi-turn LLM dialogue between intent pairs
- Respects explicit constraints and desires
- Generates reasoning trace and proposed terms
- Produces confidence score for alignment

### 4. Submission Phase
- Formats settlement as prose + structured metadata
- Includes model integrity hash for reproducibility
- Adds stake/delegation references (DPoS mode)
- Adds authority signature (PoA mode)
- Publishes to chain with acceptance window

## Consensus Modes

### Permissionless Mode (Default)
- No stake or authority required
- Pure Proof-of-Alignment consensus
- Reputation-based weighting
- 72-hour acceptance window
- Anyone can run a mediator

### DPoS Mode
- Requires minimum effective stake
- Supports delegation from token holders
- Top N mediators rotate as active validators
- Slashing for malicious behavior
- Stake-weighted governance voting

### PoA Mode
- Restricted to pre-approved authorities
- Fast 24-hour acceptance window
- No stake requirements
- Enterprise-friendly
- Governed authority set

### Hybrid Mode
- Combines multiple mechanisms
- Example: PoA authorities + DPoS rotation
- Configurable per chain

## Reputation System

Mediator reputation follows the MP-01 formula:

```
Weight = (Successful_Closures + Failed_Challenges × 2) / (1 + Upheld_Challenges_Against + Forfeited_Fees)
```

**Metrics tracked:**
- **Successful Closures**: Accepted settlements (increases weight)
- **Failed Challenges**: Honest auditing (increases weight)
- **Upheld Challenges Against**: Violations (decreases weight)
- **Forfeited Fees**: Rejected settlements (decreases weight)

Higher reputation weight improves:
- Consensus selection priority
- Challenge auditing authority
- Mapping visibility

## Fee Structure

Facilitation fees are earned when:
1. Both parties accept the proposed settlement
2. No upheld challenges exist during acceptance window
3. Settlement closes successfully

**Fee distribution:**
- **Permissionless**: 100% to mediator
- **DPoS**: 80–90% to mediator, 10–20% distributed to delegators
- **PoA**: Configurable per chain governance

## Development

### Project Structure

```
mediator-node/
├── src/
│   ├── types/              # TypeScript interfaces
│   ├── config/             # Configuration loading
│   ├── ingestion/          # Intent monitoring
│   ├── mapping/            # Vector database & semantic search
│   ├── llm/                # LLM provider integration
│   ├── settlement/         # Settlement creation & MP-05 coordination
│   ├── reputation/         # Reputation tracking
│   ├── consensus/          # DPoS, PoA, semantic consensus, validator rotation
│   ├── challenge/          # Challenge detection & management
│   ├── dispute/            # MP-03 dispute system (clarification, evidence, escalation)
│   ├── effort/             # MP-02 proof-of-effort (observers, receipts, anchoring)
│   ├── burn/               # MP-06 behavioral pressure (burn economics, load scaling)
│   ├── licensing/          # MP-04 licensing & delegation
│   ├── governance/         # Stake-weighted governance voting
│   ├── sybil/              # Sybil resistance (spam detection, submission tracking)
│   ├── websocket/          # Real-time WebSocket server & events
│   ├── monitoring/         # Health server & performance analytics
│   ├── security/           # Automated vulnerability scanning & testing
│   ├── network/            # Multi-chain orchestration
│   ├── chain/              # NatLangChain API client
│   ├── validation/         # Input validation schemas
│   ├── utils/              # Crypto, logging, circuit breaker, timeouts
│   ├── MediatorNode.ts     # Main orchestrator (1,350+ lines)
│   ├── cli.ts              # CLI interface
│   └── index.ts            # Library exports
├── test/                   # Comprehensive test suite (200+ unit, 30+ integration)
├── docs/                   # Protocol specs (MP-02 through MP-06, NCIP-000 through NCIP-015)
├── benchmark/              # Performance benchmarking
├── examples/mock-chain/    # Mock blockchain for testing
├── spec.md                 # Protocol specification (MP-01)
└── package.json
```

### Key Components

**Core Mediation**
- **MediatorNode**: Main orchestrator coordinating alignment cycles
- **IntentIngester**: Polls chain, validates intents, maintains cache
- **VectorDatabase**: HNSW index for semantic similarity search
- **LLMProvider**: Anthropic/OpenAI integration for negotiation and embeddings
- **SettlementManager**: Creates and monitors proposed settlements

**Consensus & Governance**
- **StakeManager**: DPoS stake and delegation handling
- **AuthorityManager**: PoA authority set management
- **ValidatorRotationManager**: DPoS slot-based validator rotation
- **SemanticConsensusManager**: High-value settlement multi-mediator verification
- **GovernanceManager**: Stake-weighted governance voting

**Protocol Extensions**
- **ReputationTracker**: Receipt-based reputation system (MP-01)
- **EffortCaptureSystem**: Proof-of-effort tracking (MP-02)
- **DisputeManager**: Dispute resolution and escalation (MP-03)
- **LicensingManager**: License and delegation handling (MP-04)
- **MP05SettlementCoordinator**: Settlement coordination (MP-05)
- **BurnManager**: Token burn economics and load scaling (MP-06)

**Infrastructure**
- **WebSocketServer**: Real-time event streaming
- **HealthServer**: HTTP health endpoints with Kubernetes probes
- **ChainClient**: NatLangChain API abstraction layer
- **ChallengeManager**: Settlement challenge handling
- **SecurityTestRunner**: Automated vulnerability scanning

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- unit/consensus/ValidatorRotationManager.test.ts

# Run with coverage
npm test -- --coverage

# Run linting
npm run lint

# Run benchmarks
npm run benchmark
```

Test coverage includes:
- 200+ unit tests (consensus, security, challenge, sybil, etc.)
- 30+ integration tests (settlement lifecycle, burn analytics, etc.)
- End-to-end simulation tests

## Integration with Other Repositories

This mediator node integrates with:
- **NatLangChain Node** - Main blockchain/chain instances
- **Reputation Chain** (optional) - Separate reputation tracking
- **LLM Providers** - Anthropic Claude or OpenAI

See [INTEGRATION.md](./INTEGRATION.md) for complete API documentation and multi-repo setup.

### Required NatLangChain API Endpoints

- `GET /api/v1/intents` - Fetch pending intents
- `POST /api/v1/entries` - Submit settlement entries
- `GET /api/v1/settlements/:id/status` - Check settlement status
- `GET /api/v1/reputation/:mediatorId` - Load reputation
- `POST /api/v1/reputation` - Update reputation
- `GET /api/v1/delegations/:mediatorId` - Load delegations (DPoS)
- `GET /api/v1/consensus/authorities` - Get PoA authority set

### Testing Without a Real Chain

Use the included **mock chain server** for development:

```bash
cd examples/mock-chain
npm install
npm start
```

The mock server provides all required endpoints and comes with example intents. See [examples/mock-chain/README.md](./examples/mock-chain/README.md) for details.

## Security Considerations

### Procedural Integrity
The mediator **refuses to mediate** intents that are:
- Coercive or manipulative
- Intentionally vague or unclear
- Violate the Lawful Use Guarantee

After 5 flags, an intent is archived from mediation.

### Stake Slashing
In DPoS mode, stake is at risk for:
- Submitting invalid settlements
- Violating original intent constraints
- Malicious behavior

### Sybil Resistance
- Daily posting limits (3 free intents per identity)
- Excess deposits required for additional posts
- Forfeiture on proven spam

## Governance

### DPoS Governance
Token holders can:
- Delegate stake to mediators
- Vote on parameter changes
- Propose mode transitions
- Add/remove PoA authorities

**Voting power**: 1 token = 1 vote (stake-weighted)
**Lifecycle**: 7-day voting → quorum → approval → 3-day delay → execution

## Troubleshooting

### Common Issues

**"Minimum stake requirement not met"**
- In DPoS mode, ensure `BONDED_STAKE_AMOUNT` ≥ `MIN_EFFECTIVE_STAKE`
- Or attract delegators to increase effective stake

**"Not authorized in PoA mode"**
- Your public key must be in the authority set
- Request authorization via governance proposal

**"No LLM provider configured"**
- Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`
- Verify `LLM_PROVIDER` is set correctly

**"Vector database initialization failed"**
- Ensure `VECTOR_DB_PATH` directory is writable
- Check disk space availability

## Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

See [LF1M.md](./LF1M.md) for team opportunities.

## License

MIT License - see [LICENSE](./LICENSE)

## Documentation

### Core Documentation
- [Protocol Specification](./spec.md) - MP-01 mediator protocol
- [Architecture Guide](./ARCHITECTURE.md) - System design deep dive
- [Integration Guide](./INTEGRATION.md) - API details and multi-chain setup
- [API Reference](./docs/API.md) - Complete HTTP and WebSocket API
- [Operations Runbook](./docs/OPERATIONS.md) - Production deployment guide
- [Security Hardening](./docs/SECURITY_HARDENING.md) - Security audit and hardening

### Protocol Extensions
- [MP-02: Proof-of-Effort](./docs/MP-02-spec.md) - Temporal effort tracking
- [MP-03: Disputes](./docs/MP-03-spec.md) - Dispute resolution and escalation
- [MP-04: Licensing](./docs/MP-04-spec.md) - Licensing and delegation
- [MP-05: Settlement](./docs/MP-05-spec.md) - Settlement coordination
- [MP-06: Burn Economics](./docs/MP-06-spec.md) - Behavioral pressure controls

### Governance & Community
- [NCIP Specifications](./docs/NCIP-000.md) - Semantic governance (16 documents)
- [Contributing Guide](./CONTRIBUTING.md) - How to contribute
- [Code of Conduct](./CODE_OF_CONDUCT.md) - Community standards
- [FAQ](./FAQ.md) - Common questions and answers

## Support

For issues, questions, or feedback:
- GitHub Issues: https://github.com/kase1111-hash/mediator-node/issues
- Email: kase1111@gmail.com

---

**Built with the NatLangChain protocol**
*Intent over Form. Radical Neutrality. The Refusal of Shadow.*

Post intent. Let the system find alignment.
