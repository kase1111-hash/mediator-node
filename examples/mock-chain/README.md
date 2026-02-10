# Mock NatLangChain Server

A mock HTTP server that mimics the **NatLangChain post-refocus API surface** for testing and development.

The endpoint contract is based on NatLangChain's actual API. See [NatLangChain's API_REFERENCE.md](https://github.com/kase1111-hash/NatLangChain/blob/main/API_REFERENCE.md) as the source of truth for the real API.

## Purpose

This mock server allows you to:
- Test the mediator-node without a full NatLangChain instance
- Develop and debug integration issues locally
- Simulate the mediation cycle (matching, proposal, acceptance, payout)
- Demo the four-stage alignment cycle
- Run the cross-project demo (`npm run demo` from project root)

## Installation

```bash
cd examples/mock-chain
npm install
```

## Usage

```bash
# Start the server
npm start

# Or with custom port
PORT=9000 npm start
```

The server will start on port 8545 (or your specified port) with example entries pre-loaded.

## API Endpoints

These match the NatLangChain post-refocus API surface.

### Entry Operations
- `POST /entry` - Submit any entry (intents, settlements, challenges, payouts)
- `GET /pending` - Get pending unmined entries
- `GET /entries/search?intent=<keyword>` - Search entries by keyword
- `GET /entries/author/:author` - Get entries by author

### Semantic Search
- `POST /search/semantic` - Meaning-based search (mock uses substring matching)

### Contract Operations
- `GET /contract/list?status=open` - List contracts (filter by status)
- `POST /contract/propose` - Submit contract proposal
- `POST /contract/respond` - Accept or reject a contract
- `POST /contract/payout` - Claim payout for a closed contract
- `POST /contract/match` - Find matching contracts
- `POST /contract/parse` - Parse natural language contract

### Chain Operations
- `GET /chain` - Get full blockchain (blocks + entries)
- `GET /chain/narrative` - Human-readable chain history
- `GET /validate/chain` - Validate chain integrity

### Status
- `GET /health` - Health check
- `GET /stats` - Chain statistics

### Reputation (mediator-side)
- `GET /reputation/:mediatorId` - Get reputation
- `POST /reputation` - Update reputation

### Admin Endpoints (Testing)
- `POST /admin/add-intent` - Add a test intent
- `POST /admin/accept-settlement` - Simulate party acceptance
- `POST /admin/mine` - Trigger mining of pending entries
- `POST /admin/reset` - Reset to initial state

### Deprecated Aliases
The following `/api/v1/*` routes are kept as temporary aliases and will be removed:
- `GET /api/v1/intents` → use `GET /pending`
- `POST /api/v1/entries` → use `POST /entry`
- `GET /api/v1/settlements/:id/status` → use `POST /search/semantic`
- `GET /api/v1/reputation/:mediatorId` → use `GET /reputation/:mediatorId`

## Example Data

The server initializes with 3 example entries in NatLangChain format:

1. **Rust Fluid Dynamics Library** (Alice) - `contract_type: offer`
   - Offering a high-performance library
   - Looking for 500 NLC or open-source usage
   - Professional/Engineering

2. **Ocean Simulation Needed** (Bob) - `contract_type: seek`
   - Need for climate research
   - Budget: 800 NLC
   - Research/Climate

3. **Data Visualization** (Charlie) - `contract_type: seek`
   - Interactive charts needed
   - Budget: 300 NLC
   - Professional/Design

**Alice and Bob's intents are designed to align!**

## Testing with Mediator Node

1. Start the mock server:
```bash
cd examples/mock-chain
npm start
```

2. Configure mediator-node to use the mock server:
```bash
cd ../..
cp .env.example .env
```

Edit `.env`:
```
CHAIN_ENDPOINT=http://localhost:8545
CHAIN_ID=natlang-mock-1
CONSENSUS_MODE=permissionless
```

3. Start the mediator node:
```bash
npm run build
npm start
```

4. Watch the logs - you should see:
   - Entries fetched from `/pending`
   - Embeddings generated
   - Alignment candidates found
   - Negotiation happening
   - Contract proposed via `/contract/propose` or `/entry`

## Simulating the Full Cycle

```bash
# 1. Check pending entries
curl http://localhost:8545/pending

# 2. Add a new intent
curl -X POST http://localhost:8545/admin/add-intent \
  -H "Content-Type: application/json" \
  -d '{
    "author": "test_user",
    "prose": "I need help with X and can offer Y in return",
    "desires": ["help", "collaboration"],
    "constraints": ["must be completed by next month"],
    "offeredFee": 10,
    "branch": "Test/Example"
  }'

# 3. Mine pending entries into a block
curl -X POST http://localhost:8545/admin/mine

# 4. View the blockchain
curl http://localhost:8545/chain

# 5. Semantic search
curl -X POST http://localhost:8545/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query": "fluid dynamics simulation", "top_k": 5}'

# 6. Accept a settlement (after mediator proposes one)
curl -X POST http://localhost:8545/admin/accept-settlement \
  -H "Content-Type: application/json" \
  -d '{"settlementId": "SETTLEMENT_ID_HERE", "party": "both"}'

# 7. Reset to initial state
curl -X POST http://localhost:8545/admin/reset
```

## Console Output

The server logs all activity:
- `[CHAIN]` - Chain operations (entries, contracts, mining, payouts)
- `[ADMIN]` - Admin operations
- `[DEPRECATED]` - Calls to deprecated `/api/v1/*` aliases
- `[AUDIT]` - All HTTP requests

## Limitations

This is a simple in-memory mock server for development. It does NOT:
- Persist data to disk
- Implement actual blockchain consensus or SHA-256 chaining
- Handle cryptographic verification (signatures accepted without validation)
- Perform real semantic search (uses substring matching)
- Support P2P networking
- Scale to production workloads

For production, use a real [NatLangChain](https://github.com/kase1111-hash/NatLangChain) node instance.
