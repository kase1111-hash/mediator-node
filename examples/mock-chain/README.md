# Mock NatLangChain Server

A simple mock HTTP server that implements the NatLangChain API for testing and development.

## Purpose

This mock server allows you to:
- Test the mediator-node without a full blockchain
- Develop and debug integration issues locally
- Simulate various chain scenarios
- Demonstrate the mediation cycle

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

The server will start on port 8545 (or your specified port) with example intents pre-loaded.

## API Endpoints

### Chain Endpoints
- `GET /api/v1/intents` - List intents
- `POST /api/v1/entries` - Submit entries (settlements, accepts, etc.)
- `GET /api/v1/settlements/:id/status` - Get settlement status
- `GET /api/v1/reputation/:mediatorId` - Get reputation
- `POST /api/v1/reputation` - Update reputation
- `GET /api/v1/delegations/:mediatorId` - Get delegations
- `POST /api/v1/stake/bond` - Bond stake
- `POST /api/v1/stake/unbond` - Unbond stake
- `GET /api/v1/consensus/authorities` - Get authority list
- `POST /api/v1/governance/proposals` - Submit proposal
- `GET /health` - Health check

### Admin Endpoints (Testing)
- `POST /admin/add-intent` - Add a test intent
- `POST /admin/accept-settlement` - Simulate party acceptance
- `POST /admin/reset` - Reset to initial state

## Example Data

The server initializes with 3 example intents:

1. **Rust Fluid Dynamics Library** (Alice)
   - Offering a high-performance library
   - Looking for 500 NLC or open-source usage
   - Professional/Engineering

2. **Ocean Simulation Needed** (Bob)
   - Need for climate research
   - Budget: 800 NLC
   - Research/Climate

3. **Data Visualization** (Charlie)
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
   - Intents being ingested
   - Embeddings generated
   - Alignment candidates found
   - Negotiation happening
   - Settlement proposed

## Simulating Party Acceptance

To simulate both parties accepting a settlement:

```bash
curl -X POST http://localhost:8545/admin/accept-settlement \
  -H "Content-Type: application/json" \
  -d '{
    "settlementId": "SETTLEMENT_ID_HERE",
    "party": "both"
  }'
```

The mediator will detect acceptance and claim the fee.

## Adding Test Intents

```bash
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
```

## Resetting Data

To reset to the initial example state:

```bash
curl -X POST http://localhost:8545/admin/reset
```

## Console Output

The server logs all activity:
- `[CHAIN]` - Chain operations (settlements, payouts, etc.)
- `[ADMIN]` - Admin operations
- Incoming HTTP requests

## Integration with Tests

You can use this mock server in integration tests:

```javascript
const axios = require('axios');
const MOCK_CHAIN = 'http://localhost:8545';

// In your test
beforeAll(async () => {
  // Reset chain state
  await axios.post(`${MOCK_CHAIN}/admin/reset`);
});

test('mediator proposes settlement', async () => {
  // Add test intents
  // Start mediator
  // Verify settlement created
});
```

## Limitations

This is a simple in-memory mock server for development. It does NOT:
- Persist data to disk
- Implement actual blockchain consensus
- Handle cryptographic verification (signatures accepted without validation)
- Support P2P networking
- Scale to production workloads

For production, use a real NatLangChain node implementation.
