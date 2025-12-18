# Quick Start Guide

Get the NatLangChain Mediator Node running in under 5 minutes.

## Option 1: Docker Compose (Recommended)

The fastest way to see the mediator in action with a mock chain.

### Prerequisites
- Docker and Docker Compose
- Anthropic or OpenAI API key

### Steps

1. **Clone and navigate to the repository**
```bash
git clone https://github.com/kase1111-hash/mediator-node.git
cd mediator-node
```

2. **Set your API key**
```bash
# For Anthropic Claude
export ANTHROPIC_API_KEY=your-api-key-here

# OR for OpenAI
export OPENAI_API_KEY=your-api-key-here
export LLM_PROVIDER=openai
```

3. **Start everything**
```bash
docker-compose up
```

That's it! The system will:
- Start a mock NatLangChain node with example intents
- Start the mediator node
- Begin the alignment cycle
- Automatically propose settlements for matching intents

### Watch It Work

Open logs in real-time:
```bash
docker-compose logs -f mediator-node
```

You should see:
```
[INFO] Starting alignment cycle
[INFO] Found alignment candidates: 1
[INFO] Processing alignment candidate
[INFO] Negotiation completed: success=true
[INFO] Settlement submitted successfully
```

### Test Settlement Acceptance

Simulate both parties accepting a settlement:

1. Get the settlement ID from the logs
2. Accept it:
```bash
curl -X POST http://localhost:8545/admin/accept-settlement \
  -H "Content-Type: application/json" \
  -d '{
    "settlementId": "SETTLEMENT_ID_HERE",
    "party": "both"
  }'
```

3. Watch the mediator claim the fee in the logs!

### Stop Everything
```bash
docker-compose down
```

---

## Option 2: Local Development

Run directly on your machine for development.

### Prerequisites
- Node.js 18+
- Anthropic or OpenAI API key

### Steps

1. **Install dependencies**
```bash
npm install
```

2. **Set up configuration**
```bash
cp .env.example .env
```

Edit `.env` and set:
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- `MEDIATOR_PRIVATE_KEY` (any string for testing)
- `MEDIATOR_PUBLIC_KEY` (any string for testing)

3. **Build the project**
```bash
npm run build
```

4. **Start the mock chain** (in one terminal)
```bash
cd examples/mock-chain
npm install
npm start
```

5. **Start the mediator** (in another terminal)
```bash
npm start
```

---

## Option 3: Development Mode with Hot Reload

For active development work.

```bash
# Set API key
export ANTHROPIC_API_KEY=your-key-here

# Start with hot reload
cd examples
docker-compose -f docker-compose.dev.yml up
```

This mounts your source code and reloads on changes.

---

## Verification

### Check Chain Health
```bash
curl http://localhost:8545/health
```

Expected response:
```json
{
  "status": "healthy",
  "chainId": "natlang-mock-1",
  "intents": 3,
  "settlements": 0
}
```

### Check Available Intents
```bash
curl http://localhost:8545/api/v1/intents?status=pending
```

You should see 3 example intents. Two of them (Alice's Rust library and Bob's ocean simulation) are designed to align!

### Check Mediator Status
```bash
npm run status
```

Or if using Docker:
```bash
docker-compose exec mediator-node node dist/cli.js status
```

---

## Next Steps

### Add Your Own Intents

```bash
curl -X POST http://localhost:8545/admin/add-intent \
  -H "Content-Type: application/json" \
  -d '{
    "author": "your_pubkey",
    "prose": "I am offering [your service] in exchange for [what you want]",
    "desires": ["collaboration", "payment"],
    "constraints": ["must complete by deadline"],
    "offeredFee": 5,
    "branch": "Professional/YourField"
  }'
```

The mediator will automatically detect and try to match your intent!

### Run Multiple Mediators

Test competition between mediators:

```bash
docker-compose --profile multi-node up
```

This starts two mediators competing to find alignments.

### Connect to Real NatLangChain

Once you have a real NatLangChain node running:

1. Update `.env`:
```
CHAIN_ENDPOINT=https://your-natlangchain-node.com
CHAIN_ID=natlang-mainnet-1
CONSENSUS_MODE=permissionless
```

2. Set your real cryptographic keys:
```
MEDIATOR_PRIVATE_KEY=your-actual-private-key
MEDIATOR_PUBLIC_KEY=your-actual-public-key
```

3. Start the mediator:
```bash
npm start
```

### Configure DPoS Mode

To run with stake:

```env
CONSENSUS_MODE=dpos
BONDED_STAKE_AMOUNT=1000
MIN_EFFECTIVE_STAKE=100
```

### Configure PoA Mode

To run with authority:

```env
CONSENSUS_MODE=poa
POA_AUTHORITY_KEY=your-authority-key
```

---

## Troubleshooting

### "Cannot connect to chain"
- Ensure mock-chain is running: `curl http://localhost:8545/health`
- Check `CHAIN_ENDPOINT` in your config

### "No LLM provider configured"
- Verify your API key is set correctly
- Check it's exported in your environment: `echo $ANTHROPIC_API_KEY`

### "No intents to process"
- The mock chain starts with 3 intents
- Add more with: `curl -X POST http://localhost:8545/admin/add-intent`
- Reset to defaults: `curl -X POST http://localhost:8545/admin/reset`

### "Negotiation failed"
- This is normal - not all intents align!
- Check logs for reasoning
- Try adding more compatible intents

### Docker build fails
- Ensure Docker has enough memory (4GB+ recommended)
- Clear build cache: `docker-compose build --no-cache`

---

## What's Happening Under the Hood?

1. **Ingestion**: Every 10 seconds, the mediator polls the chain for new intents
2. **Mapping**: Generates embeddings and stores in vector database
3. **Matching**: Finds similar intents using semantic search
4. **Negotiation**: LLM simulates dialogue between intent pairs
5. **Submission**: If alignment found, proposes settlement to chain
6. **Monitoring**: Watches for party acceptance every 60 seconds
7. **Fee Claim**: When both accept, claims facilitation fee

All of this happens automatically!

---

## Example Session

```bash
# Terminal 1: Start mock chain
cd examples/mock-chain && npm start

# Terminal 2: Start mediator
npm start

# Terminal 3: Watch it work
watch -n 2 'curl -s http://localhost:8545/health | jq'

# Terminal 4: Manually accept settlements
# (Get settlement ID from mediator logs, then:)
curl -X POST http://localhost:8545/admin/accept-settlement \
  -H "Content-Type: application/json" \
  -d '{"settlementId": "settlement_xyz", "party": "both"}'
```

---

## Learn More

- [Full README](./README.md) - Complete documentation
- [INTEGRATION.md](./INTEGRATION.md) - API details and multi-repo setup
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design deep dive
- [spec.md](./spec.md) - MP-01 protocol specification

---

**You're now running a fully functional NatLangChain mediator!** 🎉

Watch as it discovers alignments, negotiates terms, and earns fees automatically.
