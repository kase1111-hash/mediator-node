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
- Receipt-based reputation system
- Stake and delegation management
- Challenge window for contradiction proofs
- Semantic consensus verification
- Governance proposal handling
- Multi-chain support

## Installation

### Prerequisites
- Node.js 18+
- NatLangChain node access (API endpoint)
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
- `CHAIN_ENDPOINT`: Your NatLangChain node URL
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

### Start the Mediator Node

```bash
# Using npm
npm start

# Or use the CLI directly
node dist/cli.js start

# With custom config path
node dist/cli.js start --config ./my-config.env

# Run as daemon
node dist/cli.js start --daemon
```

### Check Status

```bash
npm run status

# Or
node dist/cli.js status
```

### Development Mode

```bash
npm run dev
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
- **DPoS**: 80-90% to mediator, 10-20% distributed to delegators
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
│   ├── settlement/         # Settlement creation & submission
│   ├── reputation/         # Reputation tracking
│   ├── consensus/          # DPoS & PoA management
│   ├── utils/              # Crypto, logging utilities
│   ├── MediatorNode.ts     # Main orchestrator
│   ├── cli.ts              # CLI interface
│   └── index.ts            # Library exports
├── spec.md                 # Protocol specification
├── step-by-step.md         # Implementation guide
├── Foundation.md           # Genesis document
└── package.json
```

### Key Components

- **IntentIngester**: Polls chain, validates intents, maintains cache
- **VectorDatabase**: HNSW index for semantic similarity search
- **LLMProvider**: Anthropic/OpenAI integration for negotiation
- **SettlementManager**: Creates and monitors proposed settlements
- **ReputationTracker**: Tracks mediator metrics
- **StakeManager**: DPoS stake and delegation handling
- **AuthorityManager**: PoA authority set management
- **MediatorNode**: Orchestrates the alignment cycle

## Testing

```bash
npm test
```

## API Integration

The Mediator Node expects the following NatLangChain API endpoints:

- `GET /api/v1/intents` - Fetch pending intents
- `POST /api/v1/entries` - Submit settlement entries
- `GET /api/v1/settlements/:id/status` - Check settlement status
- `GET /api/v1/reputation/:mediatorId` - Load reputation
- `POST /api/v1/reputation` - Update reputation
- `GET /api/v1/delegations/:mediatorId` - Load delegations
- `GET /api/v1/consensus/authorities` - Get PoA authority set

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

- [Protocol Specification](./spec.md) - MP-01 mediator protocol
- [Step-by-Step Guide](./step-by-step.md) - Implementation walkthrough
- [Foundation Document](./Foundation.md) - Genesis intent & principles

## Support

For issues, questions, or feedback:
- GitHub Issues: https://github.com/kase1111-hash/mediator-node/issues
- Email: kase1111@gmail.com

---

**Built with the NatLangChain protocol**
*Intent over Form. Radical Neutrality. The Refusal of Shadow.*

Post intent. Let the system find alignment.
