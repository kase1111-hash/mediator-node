/**
 * Mock NatLangChain API Server
 *
 * Provides a simple HTTP API that mimics the NatLangChain node interface
 * for testing and development of the mediator-node.
 *
 * NatLangChain API endpoints:
 * - POST /entry          - Add natural language entry
 * - GET  /pending        - Get pending unmined entries
 * - GET  /entries/search - Search entries by keyword
 * - GET  /entries/author/:author - Get entries by author
 * - POST /search/semantic - Meaning-based search (mock: substring matching)
 * - GET  /contract/list  - Get open contracts
 * - POST /contract/propose - Submit contract proposal
 * - POST /contract/respond - Respond to contract
 * - POST /contract/payout  - Claim payout
 * - GET  /chain          - Get full blockchain
 * - GET  /chain/narrative - Human-readable chain history
 * - GET  /validate/chain - Chain integrity validation
 * - GET  /stats          - Chain statistics
 * - GET  /health         - Health check
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8545;

// ============================================================================
// Security & Middleware
// ============================================================================

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many write requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many admin requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors());
app.use(bodyParser.json());
app.use(generalLimiter);

// Audit logging
app.use((req, res, next) => {
  const startTime = Date.now();
  console.log(`[AUDIT] ${new Date().toISOString()} ${req.method} ${req.path}`, {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
  });
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${logLevel}] ${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Content-Type validation for write requests
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentLength = req.get('Content-Length');
    if (contentLength === '0' || !req.body || Object.keys(req.body).length === 0) {
      return next();
    }
    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: 'Content-Type must be application/json',
      });
    }
  }
  next();
});

// ============================================================================
// In-memory data stores
// ============================================================================

let pendingEntries = [];   // Unmined entries
let blocks = [];           // Mined blocks
let contracts = [];        // Contract proposals / settlements
let reputation = {};       // Mediator reputation

// ============================================================================
// Helper functions
// ============================================================================

function generateHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data) + Date.now() + Math.random()).digest('hex');
}

function mineBlock() {
  if (pendingEntries.length === 0) return null;

  const previousHash = blocks.length > 0 ? blocks[blocks.length - 1].hash : '0'.repeat(64);
  const block = {
    index: blocks.length,
    timestamp: Date.now(),
    entries: [...pendingEntries],
    previous_hash: previousHash,
    nonce: Math.floor(Math.random() * 100000),
    hash: generateHash({ index: blocks.length, entries: pendingEntries, previousHash }),
  };

  blocks.push(block);
  pendingEntries = [];
  console.log(`[CHAIN] Mined block #${block.index} with ${block.entries.length} entries`);
  return block;
}

/** Simple substring-based "semantic" search for the mock */
function semanticSearch(query, entries, topK = 10) {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter(t => t.length > 2);

  const scored = entries.map(entry => {
    const text = `${entry.content || ''} ${entry.intent || ''} ${JSON.stringify(entry.metadata || {})}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 1;
    }
    // Bonus for exact query match
    if (text.includes(queryLower)) score += 2;
    return { entry, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => ({ ...s.entry, score: s.score / (terms.length + 2) }));
}

/** Get all entries (pending + mined) */
function getAllEntries() {
  const minedEntries = blocks.flatMap(b => b.entries);
  return [...minedEntries, ...pendingEntries];
}

// ============================================================================
// Initialize example data
// ============================================================================

function initializeExampleData() {
  pendingEntries = [];
  blocks = [];
  contracts = [];

  // Create example entries in NatLangChain format
  const exampleEntries = [
    {
      content: 'I am offering a high-performance Rust library for fluid dynamics simulation. 400 hours of work. Looking for 500 NLC or equivalent compute time. Free for open-source climate models.',
      author: 'user_alice_pubkey',
      intent: 'compensation',
      timestamp: Date.now() - 3600000,
      metadata: {
        is_contract: true,
        contract_type: 'offer',
        validation_status: 'valid',
        hash: '0xabc123def456',
        desires: ['compensation', 'usage', 'open-source collaboration'],
        constraints: ['must be used for legitimate research', 'attribution required'],
        offered_fee: 5,
        branch: 'Professional/Engineering',
        status: 'pending',
      },
    },
    {
      content: 'We need a high-resolution ocean current simulation for climate research. Budget of 800 NLC. Must be fast, auditable, and documented in plain English.',
      author: 'user_bob_pubkey',
      intent: 'performance',
      timestamp: Date.now() - 1800000,
      metadata: {
        is_contract: true,
        contract_type: 'seek',
        validation_status: 'valid',
        hash: '0x789xyz012abc',
        desires: ['performance', 'documentation', 'auditability'],
        constraints: ['must complete within 60 days', 'requires testing data'],
        offered_fee: 8,
        branch: 'Research/Climate',
        status: 'pending',
      },
    },
    {
      content: 'Seeking a data visualization expert to create interactive climate charts. 300 NLC budget. Need D3.js or similar.',
      author: 'user_charlie_pubkey',
      intent: 'interactive visualization',
      timestamp: Date.now() - 7200000,
      metadata: {
        is_contract: true,
        contract_type: 'seek',
        validation_status: 'valid',
        hash: '0xdef456ghi789',
        desires: ['interactive visualization', 'responsive design'],
        constraints: ['must work on mobile', 'accessibility required'],
        offered_fee: 3,
        branch: 'Professional/Design',
        status: 'pending',
      },
    },
  ];

  // Add entries to pending pool
  pendingEntries = exampleEntries;

  // Initialize reputation for common mediators
  reputation = {
    'mediator_pubkey_1': {
      mediatorId: 'mediator_pubkey_1',
      successfulClosures: 10,
      failedChallenges: 2,
      upheldChallengesAgainst: 0,
      forfeitedFees: 1,
      weight: 21.0,
      lastUpdated: Date.now(),
    },
  };
}

// ============================================================================
// NatLangChain-native routes
// ============================================================================

// POST /entry - Submit any entry (intents, settlements, challenges, payouts)
app.post('/entry', writeLimiter, (req, res) => {
  const { content, author, intent, metadata, signature, validate, auto_mine } = req.body;

  if (!content || !author) {
    return res.status(400).json({ error: 'content and author are required' });
  }

  const entry = {
    content,
    author,
    intent: intent || 'general',
    timestamp: Date.now(),
    metadata: metadata || {},
    signature: signature || null,
  };

  pendingEntries.push(entry);
  console.log(`[CHAIN] New entry from ${author}: "${content.substring(0, 60)}..."`);

  // Handle contract-type entries (settlements, accepts, payouts)
  if (metadata?.is_contract && metadata?.contract_type === 'proposal') {
    const contract = {
      contract_id: metadata.settlement_id || `contract_${Date.now()}`,
      offer_ref: metadata.intent_hash_a,
      seek_ref: metadata.intent_hash_b,
      proposal_content: content,
      facilitation_fee: metadata.facilitation_fee || 0,
      status: 'open',
      mediator_id: author,
      timestamp: Date.now(),
      acceptance_deadline: metadata.acceptance_deadline || Date.now() + 72 * 60 * 60 * 1000,
      party_a_accepted: false,
      party_b_accepted: false,
      challenges: [],
      terms: metadata,
    };
    contracts.push(contract);
    console.log(`[CHAIN] Contract proposal registered: ${contract.contract_id}`);
  }

  // Auto-mine if requested
  if (auto_mine) {
    mineBlock();
  }

  res.status(201).json({
    message: 'Entry added',
    entry_id: generateHash(entry),
    hash: generateHash(entry),
    timestamp: entry.timestamp,
  });
});

// GET /pending - Get pending unmined entries
app.get('/pending', (req, res) => {
  res.json({ entries: pendingEntries });
});

// GET /entries/search - Keyword search
app.get('/entries/search', (req, res) => {
  const { intent, status, author, limit } = req.query;
  let results = getAllEntries();

  if (intent && typeof intent === 'string') {
    const keyword = intent.toLowerCase();
    results = results.filter(e => {
      const text = `${e.content || ''} ${e.intent || ''} ${JSON.stringify(e.metadata || {})}`.toLowerCase();
      return text.includes(keyword);
    });
  }

  if (status && typeof status === 'string') {
    results = results.filter(e => e.metadata?.status === status);
  }

  if (author && typeof author === 'string') {
    results = results.filter(e => e.author === author);
  }

  if (limit) {
    const limitVal = parseInt(limit, 10);
    if (!isNaN(limitVal) && limitVal > 0) {
      results = results.slice(0, Math.min(limitVal, 1000));
    }
  }

  res.json({ entries: results, results });
});

// GET /entries/author/:author - Get entries by author
app.get('/entries/author/:author', (req, res) => {
  const { author } = req.params;
  const results = getAllEntries().filter(e => e.author === author);
  res.json({ entries: results });
});

// POST /search/semantic - Meaning-based search (mock: substring matching)
app.post('/search/semantic', (req, res) => {
  const { query, top_k, min_score, field } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  const allEntries = getAllEntries();
  const results = semanticSearch(query, allEntries, top_k || 10);

  // Filter by min_score if provided
  const filtered = min_score
    ? results.filter(r => r.score >= min_score)
    : results;

  res.json({ results: filtered, total: filtered.length });
});

// GET /contract/list - Get contracts by status
app.get('/contract/list', (req, res) => {
  const { status, limit } = req.query;

  let filtered = contracts;
  if (status && typeof status === 'string') {
    filtered = filtered.filter(c => c.status === status);
  }

  if (limit) {
    const limitVal = parseInt(limit, 10);
    if (!isNaN(limitVal) && limitVal > 0) {
      filtered = filtered.slice(0, limitVal);
    }
  }

  res.json({ contracts: filtered });
});

// POST /contract/propose - Submit contract proposal
app.post('/contract/propose', writeLimiter, (req, res) => {
  const {
    offer_ref, seek_ref, proposal_content, match_score,
    facilitation_fee, terms, mediator_id, timestamp, acceptance_deadline,
  } = req.body;

  const contract = {
    contract_id: `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    offer_ref,
    seek_ref,
    proposal_content: proposal_content || '',
    match_score: match_score || 0,
    facilitation_fee: facilitation_fee || 0,
    status: 'open',
    mediator_id,
    timestamp: timestamp || Date.now(),
    acceptance_deadline: acceptance_deadline || Date.now() + 72 * 60 * 60 * 1000,
    party_a_accepted: false,
    party_b_accepted: false,
    challenges: [],
    terms: terms || {},
  };

  contracts.push(contract);
  console.log(`[CHAIN] Contract proposed: ${contract.contract_id} (${offer_ref} <-> ${seek_ref})`);

  res.status(201).json({
    contract_id: contract.contract_id,
    status: 'open',
    message: 'Contract proposal registered',
  });
});

// POST /contract/respond - Respond to a contract (accept/reject)
app.post('/contract/respond', writeLimiter, (req, res) => {
  const { contract_id, party, action } = req.body;

  const contract = contracts.find(c => c.contract_id === contract_id);
  if (!contract) {
    return res.status(404).json({ error: 'Contract not found' });
  }

  if (action === 'accept') {
    if (party === 'A' || party === 'offer') {
      contract.party_a_accepted = true;
    } else if (party === 'B' || party === 'seek') {
      contract.party_b_accepted = true;
    }

    if (contract.party_a_accepted && contract.party_b_accepted) {
      contract.status = 'accepted';
    }

    console.log(`[CHAIN] Contract ${contract_id} accepted by party ${party}`);
  } else if (action === 'reject') {
    contract.status = 'rejected';
    console.log(`[CHAIN] Contract ${contract_id} rejected by party ${party}`);
  }

  res.json({ contract_id, status: contract.status });
});

// POST /contract/payout - Claim payout for a closed contract
app.post('/contract/payout', writeLimiter, (req, res) => {
  const { settlement_ref, mediator_id, fee_amount } = req.body;

  // Find the contract
  const contract = contracts.find(
    c => c.contract_id === settlement_ref ||
      (c.terms && c.terms.settlement_id === settlement_ref)
  );

  if (contract) {
    contract.status = 'closed';
    console.log(`[CHAIN] Payout claimed: ${fee_amount} NLC for contract ${settlement_ref} by ${mediator_id}`);
  } else {
    console.log(`[CHAIN] Payout claimed for unknown contract ${settlement_ref} by ${mediator_id}`);
  }

  res.json({
    success: true,
    message: 'Payout processed',
    settlement_ref,
    mediator_id,
    fee_amount,
  });
});

// POST /contract/match - Find matching contracts (mock: simple keyword overlap)
app.post('/contract/match', (req, res) => {
  const { content, top_k } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const keywords = content.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const scored = contracts
    .filter(c => c.status === 'open')
    .map(c => {
      const text = `${c.proposal_content || ''} ${JSON.stringify(c.terms || {})}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) score++;
      }
      return { ...c, match_score: score / Math.max(keywords.length, 1) };
    })
    .filter(c => c.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, top_k || 5);

  res.json({ matches: scored });
});

// POST /contract/parse - Parse natural language contract (mock: extract keywords)
app.post('/contract/parse', (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  res.json({
    parsed: true,
    contract_type: content.toLowerCase().includes('offer') ? 'offer' : 'seek',
    terms_extracted: content.split(/[.,;]/).map(s => s.trim()).filter(Boolean),
    confidence: 0.75,
  });
});

// GET /chain - Get full blockchain
app.get('/chain', (req, res) => {
  res.json({
    blocks,
    length: blocks.length,
    pending_entries: pendingEntries.length,
  });
});

// GET /chain/narrative - Human-readable chain history
app.get('/chain/narrative', (req, res) => {
  const narrative = blocks.map(block => {
    const entries = block.entries.map(e =>
      `  - [${e.author}]: "${e.content.substring(0, 80)}..."`
    ).join('\n');
    return `Block #${block.index} (${new Date(block.timestamp).toISOString()}):\n${entries}`;
  }).join('\n\n');

  res.type('text/plain').send(narrative || 'No blocks mined yet.');
});

// GET /validate/chain - Validate chain integrity
app.get('/validate/chain', (req, res) => {
  const issues = [];

  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].previous_hash !== blocks[i - 1].hash) {
      issues.push(`Block #${i} has invalid previous_hash`);
    }
  }

  res.json({
    valid: issues.length === 0,
    blocks: blocks.length,
    issues: issues.length > 0 ? issues : undefined,
  });
});

// GET /stats - Chain statistics
app.get('/stats', (req, res) => {
  const allEntries = getAllEntries();
  res.json({
    blocks: blocks.length,
    pending_entries: pendingEntries.length,
    total_entries: allEntries.length,
    contracts: contracts.length,
    open_contracts: contracts.filter(c => c.status === 'open').length,
    accepted_contracts: contracts.filter(c => c.status === 'accepted').length,
    closed_contracts: contracts.filter(c => c.status === 'closed').length,
  });
});

// GET /health - Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    chainId: 'natlang-mock-1',
    consensusMode: 'permissionless',
    blocks: blocks.length,
    pending_entries: pendingEntries.length,
    contracts: contracts.length,
    uptime: process.uptime(),
  });
});

// ============================================================================
// Reputation routes (mediator-side, no /api/v1/ prefix needed but kept for compat)
// ============================================================================

app.get('/reputation/:mediatorId', (req, res) => {
  const { mediatorId } = req.params;
  const rep = reputation[mediatorId];

  if (!rep) {
    return res.json({
      mediatorId,
      successfulClosures: 0,
      failedChallenges: 0,
      upheldChallengesAgainst: 0,
      forfeitedFees: 0,
      weight: 1.0,
      lastUpdated: Date.now(),
    });
  }

  res.json(rep);
});

app.post('/reputation', writeLimiter, (req, res) => {
  const { mediatorId, reputation: repData } = req.body;
  reputation[mediatorId] = repData;
  console.log(`[CHAIN] Reputation updated for ${mediatorId}: weight=${repData.weight}`);
  res.json({ success: true });
});

// ============================================================================
// Deprecated /api/v1/ aliases (temporary — will be removed in Phase 5+)
// ============================================================================

// GET /api/v1/intents → alias for GET /pending (filter by is_contract)
app.get('/api/v1/intents', (req, res) => {
  console.log('[DEPRECATED] GET /api/v1/intents — use GET /pending instead');
  const { status, since, limit } = req.query;

  let filtered = getAllEntries().filter(e => e.metadata?.is_contract);

  if (status && typeof status === 'string') {
    const allowedStatuses = ['pending', 'matched', 'settled', 'challenged', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status parameter' });
    }
    filtered = filtered.filter(e => (e.metadata?.status || 'pending') === status);
  }

  if (since) {
    const sinceTs = parseInt(since, 10);
    if (!isNaN(sinceTs) && sinceTs >= 0) {
      filtered = filtered.filter(e => (e.timestamp || 0) >= sinceTs);
    }
  }

  if (limit) {
    const limitVal = parseInt(limit, 10);
    if (!isNaN(limitVal) && limitVal > 0 && limitVal <= 1000) {
      filtered = filtered.slice(0, limitVal);
    }
  }

  // Return in legacy format for backwards compatibility
  const intents = filtered.map(e => ({
    hash: e.metadata?.hash || '',
    author: e.author,
    prose: e.content,
    desires: e.metadata?.desires || [],
    constraints: e.metadata?.constraints || [],
    offeredFee: e.metadata?.offered_fee || 0,
    timestamp: e.timestamp,
    status: e.metadata?.status || 'pending',
    branch: e.metadata?.branch || '',
  }));

  res.json({ intents });
});

// POST /api/v1/entries → alias for POST /entry
app.post('/api/v1/entries', writeLimiter, (req, res) => {
  console.log('[DEPRECATED] POST /api/v1/entries — use POST /entry instead');
  const { type, author, content, metadata, signature } = req.body;

  const entry = {
    content: content || '',
    author: author || '',
    intent: type || 'general',
    timestamp: Date.now(),
    metadata: metadata || {},
    signature: signature || null,
  };

  pendingEntries.push(entry);

  // Handle settlement-type entries
  if (type === 'settlement' && metadata) {
    const contract = {
      contract_id: metadata.id || `contract_${Date.now()}`,
      offer_ref: metadata.intentHashA,
      seek_ref: metadata.intentHashB,
      proposal_content: content || '',
      status: 'open',
      mediator_id: author,
      timestamp: Date.now(),
      party_a_accepted: false,
      party_b_accepted: false,
      challenges: [],
      terms: metadata,
    };
    contracts.push(contract);
  }

  const entryId = `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.status(201).json({ entryId, hash: entryId });
});

// GET /api/v1/settlements/:id/status → search contracts
app.get('/api/v1/settlements/:id/status', (req, res) => {
  console.log('[DEPRECATED] GET /api/v1/settlements/:id/status — use POST /search/semantic instead');
  const { id } = req.params;

  const contract = contracts.find(
    c => c.contract_id === id ||
      (c.terms && c.terms.settlement_id === id) ||
      (c.terms && c.terms.id === id)
  );

  if (!contract) {
    return res.status(404).json({ error: 'Settlement not found' });
  }

  res.json({
    id: contract.contract_id,
    status: contract.status,
    partyAAccepted: contract.party_a_accepted || false,
    partyBAccepted: contract.party_b_accepted || false,
    challenges: contract.challenges || [],
  });
});

// GET /api/v1/reputation/:mediatorId → alias
app.get('/api/v1/reputation/:mediatorId', (req, res) => {
  console.log('[DEPRECATED] GET /api/v1/reputation/:mediatorId — use GET /reputation/:mediatorId');
  const { mediatorId } = req.params;
  const rep = reputation[mediatorId];
  if (!rep) {
    return res.json({
      mediatorId,
      successfulClosures: 0,
      failedChallenges: 0,
      upheldChallengesAgainst: 0,
      forfeitedFees: 0,
      weight: 1.0,
      lastUpdated: Date.now(),
    });
  }
  res.json(rep);
});

// POST /api/v1/reputation → alias
app.post('/api/v1/reputation', (req, res) => {
  console.log('[DEPRECATED] POST /api/v1/reputation — use POST /reputation');
  const { mediatorId, reputation: repData } = req.body;
  reputation[mediatorId] = repData;
  res.json({ success: true });
});

// ============================================================================
// Admin endpoints (testing)
// ============================================================================

// POST /admin/add-intent - Add a test intent in NatLangChain entry format
app.post('/admin/add-intent', adminLimiter, (req, res) => {
  const allowedFields = ['author', 'prose', 'desires', 'constraints', 'offeredFee', 'branch', 'nonce', 'signature', 'metadata'];
  const safeBody = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      safeBody[field] = req.body[field];
    }
  });

  const hash = `0x${Date.now().toString(16)}${Math.random().toString(36).substr(2, 9)}`;
  const entry = {
    content: safeBody.prose || '',
    author: safeBody.author || 'unknown',
    intent: (safeBody.desires && safeBody.desires[0]) || 'general',
    timestamp: Date.now(),
    metadata: {
      is_contract: true,
      contract_type: 'offer',
      validation_status: 'valid',
      hash,
      desires: safeBody.desires || [],
      constraints: safeBody.constraints || [],
      offered_fee: safeBody.offeredFee || 0,
      branch: safeBody.branch || 'General',
      status: 'pending',
      ...(safeBody.metadata || {}),
    },
  };

  pendingEntries.push(entry);
  console.log(`[ADMIN] Added test intent: ${hash}`);

  // Return legacy format for backwards compat
  res.status(201).json({
    hash,
    author: entry.author,
    prose: entry.content,
    desires: entry.metadata.desires,
    constraints: entry.metadata.constraints,
    offeredFee: entry.metadata.offered_fee,
    timestamp: entry.timestamp,
    status: 'pending',
    branch: entry.metadata.branch,
  });
});

// POST /admin/accept-settlement - Simulate party acceptance
app.post('/admin/accept-settlement', adminLimiter, (req, res) => {
  const { settlementId, party } = req.body;
  const contract = contracts.find(
    c => c.contract_id === settlementId ||
      (c.terms && c.terms.settlement_id === settlementId)
  );

  if (!contract) {
    return res.status(404).json({ error: 'Settlement/contract not found' });
  }

  if (party === 'A' || party === 'both') {
    contract.party_a_accepted = true;
  }
  if (party === 'B' || party === 'both') {
    contract.party_b_accepted = true;
  }
  if (contract.party_a_accepted && contract.party_b_accepted) {
    contract.status = 'accepted';
  }

  console.log(`[ADMIN] Contract ${contract.contract_id} accepted by ${party}`);
  res.json(contract);
});

// POST /admin/mine - Trigger mining of pending entries
app.post('/admin/mine', adminLimiter, (req, res) => {
  const block = mineBlock();
  if (!block) {
    return res.json({ message: 'No pending entries to mine' });
  }
  res.json({ message: `Mined block #${block.index}`, block });
});

// POST /admin/reset - Reset all data
app.post('/admin/reset', (req, res) => {
  initializeExampleData();
  console.log('[ADMIN] Data reset to initial state');
  res.json({ success: true });
});

// ============================================================================
// Initialize and start
// ============================================================================

initializeExampleData();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Mock NatLangChain API Server                                ║
║                                                              ║
║  Port: ${String(PORT).padEnd(54)}║
║  Chain ID: natlang-mock-1                                    ║
║  Consensus: Permissionless                                   ║
║                                                              ║
║  Example entries loaded: ${String(pendingEntries.length).padEnd(35)}║
║                                                              ║
║  NatLangChain Endpoints:                                     ║
║    POST /entry              Submit entry                     ║
║    GET  /pending            Pending entries                   ║
║    GET  /entries/search     Keyword search                    ║
║    GET  /entries/author/:a  Entries by author                 ║
║    POST /search/semantic    Semantic search                   ║
║    GET  /contract/list      List contracts                    ║
║    POST /contract/propose   Propose contract                  ║
║    POST /contract/respond   Respond to contract               ║
║    POST /contract/payout    Claim payout                      ║
║    GET  /chain              Full blockchain                   ║
║    GET  /validate/chain     Validate integrity                ║
║    GET  /stats              Statistics                        ║
║    GET  /health             Health check                      ║
║                                                              ║
║  Deprecated aliases: /api/v1/* (use native routes above)     ║
║                                                              ║
║  Admin: POST /admin/{add-intent,accept-settlement,mine,reset}║
║                                                              ║
║  Ready to accept mediator connections!                        ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
