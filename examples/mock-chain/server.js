/**
 * Mock NatLangChain API Server
 *
 * Provides a simple HTTP API that mimics the NatLangChain node interface
 * for testing and development of the mediator-node.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8545;

// SECURITY: General rate limiter to prevent DoS attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// SECURITY: Strict rate limiter for write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 write requests per windowMs
  message: { error: 'Too many write requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// SECURITY: Very strict rate limiter for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 admin requests per windowMs
  message: { error: 'Too many admin requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(bodyParser.json());
app.use(generalLimiter);

// SECURITY: Content-Type validation middleware for POST/PUT/PATCH requests
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');

    // Allow requests with no body (Content-Length: 0)
    const contentLength = req.get('Content-Length');
    if (contentLength === '0' || !req.body || Object.keys(req.body).length === 0) {
      return next();
    }

    // Require application/json for requests with body
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: 'Content-Type must be application/json',
        received: contentType || 'none'
      });
    }
  }
  next();
});

// In-memory data stores
let intents = [];
let settlements = [];
let entries = [];
let reputation = {};
let delegations = {};
let authorities = [
  'authority_pubkey_alice',
  'authority_pubkey_bob',
  'authority_pubkey_charlie'
];

// Initialize with example data
function initializeExampleData() {
  intents = [
    {
      hash: '0xabc123def456',
      author: 'user_alice_pubkey',
      prose: 'I am offering a high-performance Rust library for fluid dynamics simulation. 400 hours of work. Looking for 500 NLC or equivalent compute time. Free for open-source climate models.',
      desires: ['compensation', 'usage', 'open-source collaboration'],
      constraints: ['must be used for legitimate research', 'attribution required'],
      offeredFee: 5,
      timestamp: Date.now() - 3600000,
      status: 'pending',
      branch: 'Professional/Engineering'
    },
    {
      hash: '0x789xyz012abc',
      author: 'user_bob_pubkey',
      prose: 'We need a high-resolution ocean current simulation for climate research. Budget of 800 NLC. Must be fast, auditable, and documented in plain English.',
      desires: ['performance', 'documentation', 'auditability'],
      constraints: ['must complete within 60 days', 'requires testing data'],
      offeredFee: 8,
      timestamp: Date.now() - 1800000,
      status: 'pending',
      branch: 'Research/Climate'
    },
    {
      hash: '0xdef456ghi789',
      author: 'user_charlie_pubkey',
      prose: 'Seeking a data visualization expert to create interactive climate charts. 300 NLC budget. Need D3.js or similar.',
      desires: ['interactive visualization', 'responsive design'],
      constraints: ['must work on mobile', 'accessibility required'],
      offeredFee: 3,
      timestamp: Date.now() - 7200000,
      status: 'pending',
      branch: 'Professional/Design'
    }
  ];

  // Initialize reputation for common mediators
  reputation = {
    'mediator_pubkey_1': {
      mediatorId: 'mediator_pubkey_1',
      successfulClosures: 10,
      failedChallenges: 2,
      upheldChallengesAgainst: 0,
      forfeitedFees: 1,
      weight: 21.0,
      lastUpdated: Date.now()
    }
  };

  delegations = {
    'mediator_pubkey_1': [
      {
        delegatorId: 'user_dave_pubkey',
        mediatorId: 'mediator_pubkey_1',
        amount: 1000,
        timestamp: Date.now() - 86400000,
        status: 'active'
      }
    ]
  };
}

// Routes

// GET /api/v1/intents - Fetch intents
app.get('/api/v1/intents', (req, res) => {
  const { status, since, limit } = req.query;

  let filtered = intents;

  // SECURITY: Validate query parameters
  if (status && typeof status === 'string') {
    // Validate status is one of the allowed values
    const allowedStatuses = ['pending', 'matched', 'settled', 'challenged', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status parameter' });
    }
    filtered = filtered.filter(i => i.status === status);
  }

  // SECURITY: Validate and sanitize 'since' parameter
  if (since) {
    const sinceTimestamp = parseInt(since, 10);
    if (isNaN(sinceTimestamp) || sinceTimestamp < 0) {
      return res.status(400).json({ error: 'Invalid since parameter (must be non-negative integer)' });
    }
    filtered = filtered.filter(i => i.timestamp >= sinceTimestamp);
  }

  // SECURITY: Validate and sanitize 'limit' parameter
  if (limit) {
    const limitValue = parseInt(limit, 10);
    if (isNaN(limitValue) || limitValue < 1 || limitValue > 1000) {
      return res.status(400).json({ error: 'Invalid limit parameter (must be 1-1000)' });
    }
    filtered = filtered.slice(0, limitValue);
  }

  res.json({ intents: filtered });
});

// POST /api/v1/entries - Submit entry
app.post('/api/v1/entries', writeLimiter, (req, res) => {
  const { type, author, content, metadata, signature } = req.body;

  const entry = {
    id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    author,
    content,
    metadata,
    signature,
    timestamp: Date.now()
  };

  entries.push(entry);

  // Handle specific entry types
  if (type === 'settlement') {
    settlements.push({
      ...metadata,
      status: 'proposed',
      partyAAccepted: false,
      partyBAccepted: false,
      challenges: []
    });
    console.log(`[CHAIN] New settlement proposed: ${metadata.id}`);
  } else if (type === 'accept') {
    const settlement = settlements.find(s => s.id === metadata.settlementId);
    if (settlement) {
      if (metadata.party === 'A' || metadata.party === settlement.intentHashA) {
        settlement.partyAAccepted = true;
      } else {
        settlement.partyBAccepted = true;
      }
      console.log(`[CHAIN] Settlement ${metadata.settlementId} accepted by party`);
    }
  } else if (type === 'payout') {
    console.log(`[CHAIN] Payout claimed for settlement ${metadata.settlementId}`);
  }

  res.status(201).json({ entryId: entry.id, hash: entry.id });
});

// GET /api/v1/settlements/:id/status - Get settlement status
app.get('/api/v1/settlements/:id/status', (req, res) => {
  const { id } = req.params;
  const settlement = settlements.find(s => s.id === id);

  if (!settlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }

  res.json(settlement);
});

// GET /api/v1/reputation/:mediatorId - Get reputation
app.get('/api/v1/reputation/:mediatorId', (req, res) => {
  const { mediatorId } = req.params;
  const rep = reputation[mediatorId];

  if (!rep) {
    // Return default reputation for new mediators
    return res.json({
      mediatorId,
      successfulClosures: 0,
      failedChallenges: 0,
      upheldChallengesAgainst: 0,
      forfeitedFees: 0,
      weight: 1.0,
      lastUpdated: Date.now()
    });
  }

  res.json(rep);
});

// POST /api/v1/reputation - Update reputation
app.post('/api/v1/reputation', (req, res) => {
  const { mediatorId, reputation: repData } = req.body;
  reputation[mediatorId] = repData;
  console.log(`[CHAIN] Reputation updated for ${mediatorId}: weight=${repData.weight}`);
  res.json({ success: true });
});

// GET /api/v1/delegations/:mediatorId - Get delegations
app.get('/api/v1/delegations/:mediatorId', (req, res) => {
  const { mediatorId } = req.params;
  const dels = delegations[mediatorId] || [];
  res.json({ delegations: dels });
});

// POST /api/v1/stake/bond - Bond stake
app.post('/api/v1/stake/bond', (req, res) => {
  const { mediatorId, amount } = req.body;
  console.log(`[CHAIN] Stake bonded: ${mediatorId} -> ${amount} NLC`);
  res.json({ success: true });
});

// POST /api/v1/stake/unbond - Unbond stake
app.post('/api/v1/stake/unbond', (req, res) => {
  const { mediatorId } = req.body;
  console.log(`[CHAIN] Stake unbonding initiated: ${mediatorId}`);
  res.json({ success: true });
});

// GET /api/v1/consensus/authorities - Get authority set
app.get('/api/v1/consensus/authorities', (req, res) => {
  res.json({ authorities });
});

// POST /api/v1/governance/proposals - Submit governance proposal
app.post('/api/v1/governance/proposals', (req, res) => {
  const proposal = req.body;
  const proposalId = `proposal_${Date.now()}`;
  console.log(`[CHAIN] Governance proposal submitted: ${proposal.title}`);
  res.status(201).json({ proposalId });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    chainId: 'natlang-mock-1',
    consensusMode: 'permissionless',
    intents: intents.length,
    settlements: settlements.length,
    uptime: process.uptime()
  });
});

// Admin endpoints for testing

// POST /admin/add-intent - Add a test intent
app.post('/admin/add-intent', adminLimiter, (req, res) => {
  // SECURITY: Use whitelist approach instead of spreading req.body to prevent prototype pollution
  const allowedFields = ['author', 'prose', 'desires', 'constraints', 'offeredFee', 'branch', 'nonce', 'signature', 'metadata'];
  const safeBody = {};

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      safeBody[field] = req.body[field];
    }
  });

  const intent = {
    hash: `0x${Date.now().toString(16)}${Math.random().toString(36).substr(2, 9)}`,
    ...safeBody,
    timestamp: Date.now(),
    status: 'pending'
  };
  intents.push(intent);
  console.log(`[ADMIN] Added test intent: ${intent.hash}`);
  res.status(201).json(intent);
});

// POST /admin/accept-settlement - Simulate party acceptance
app.post('/admin/accept-settlement', adminLimiter, (req, res) => {
  const { settlementId, party } = req.body;
  const settlement = settlements.find(s => s.id === settlementId);

  if (!settlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }

  if (party === 'A' || party === 'both') {
    settlement.partyAAccepted = true;
  }
  if (party === 'B' || party === 'both') {
    settlement.partyBAccepted = true;
  }

  console.log(`[ADMIN] Settlement ${settlementId} accepted by ${party}`);
  res.json(settlement);
});

// GET /admin/reset - Reset all data
app.post('/admin/reset', (req, res) => {
  intents = [];
  settlements = [];
  entries = [];
  reputation = {};
  delegations = {};
  initializeExampleData();
  console.log('[ADMIN] Data reset to initial state');
  res.json({ success: true });
});

// Initialize and start
initializeExampleData();

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Mock NatLangChain API Server                              ║
║                                                            ║
║  Port: ${PORT}                                            ║
║  Chain ID: natlang-mock-1                                  ║
║  Consensus: Permissionless                                 ║
║                                                            ║
║  Example intents loaded: ${intents.length}                              ║
║                                                            ║
║  API Endpoints:                                            ║
║    GET  /api/v1/intents                                    ║
║    POST /api/v1/entries                                    ║
║    GET  /api/v1/settlements/:id/status                     ║
║    GET  /api/v1/reputation/:mediatorId                     ║
║    POST /api/v1/reputation                                 ║
║    GET  /health                                            ║
║                                                            ║
║  Admin Endpoints (for testing):                            ║
║    POST /admin/add-intent                                  ║
║    POST /admin/accept-settlement                           ║
║    POST /admin/reset                                       ║
║                                                            ║
║  Ready to accept mediator connections!                     ║
╚════════════════════════════════════════════════════════════╝
  `);
});
