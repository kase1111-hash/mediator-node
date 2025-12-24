/**
 * Mediator Node API Client
 * Handles all communication with the mediator node backend
 */

const API_BASE = '/api/v1';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

// ============================================================
// Health & Status
// ============================================================

export async function getHealth() {
  return fetchAPI('/health');
}

export async function getStatus() {
  return fetchAPI('/status');
}

export async function getStats() {
  return fetchAPI('/stats');
}

// ============================================================
// Settlement Operations
// ============================================================

export async function getActiveSettlements() {
  return fetchAPI('/settlements/active');
}

export async function getSettlement(id) {
  return fetchAPI(`/settlements/${id}`);
}

export async function getSettlementHistory(limit = 50) {
  return fetchAPI(`/settlements/history?limit=${limit}`);
}

export async function getChallengedSettlements() {
  return fetchAPI('/settlements/challenged');
}

// ============================================================
// Intent Operations
// ============================================================

export async function getPendingIntents() {
  return fetchAPI('/intents/pending');
}

export async function getAlignmentCandidates() {
  return fetchAPI('/intents/candidates');
}

export async function getIntent(hash) {
  return fetchAPI(`/intents/${hash}`);
}

// ============================================================
// Reputation Operations
// ============================================================

export async function getReputation() {
  return fetchAPI('/reputation');
}

export async function getReputationHistory() {
  return fetchAPI('/reputation/history');
}

// ============================================================
// Dispute Operations
// ============================================================

export async function getActiveDisputes() {
  return fetchAPI('/disputes/active');
}

export async function getDispute(id) {
  return fetchAPI(`/disputes/${id}`);
}

export async function getChallenges() {
  return fetchAPI('/challenges');
}

// ============================================================
// Burn Analytics
// ============================================================

export async function getBurnStats() {
  return fetchAPI('/burn/stats');
}

export async function getBurnHistory(period = 'week') {
  return fetchAPI(`/burn/history?period=${period}`);
}

// ============================================================
// Configuration
// ============================================================

export async function getConfig() {
  return fetchAPI('/config');
}

// ============================================================
// Verification
// ============================================================

export async function getPendingVerifications() {
  return fetchAPI('/verifications/pending');
}

export async function getVerificationStatus(settlementId) {
  return fetchAPI(`/verifications/${settlementId}`);
}

// ============================================================
// Governance
// ============================================================

export async function getActiveProposals() {
  return fetchAPI('/governance/proposals?status=voting');
}

export async function getProposal(id) {
  return fetchAPI(`/governance/proposals/${id}`);
}

// ============================================================
// WebSocket Connection
// ============================================================

export function createWebSocketConnection(onMessage, onError, onClose) {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    if (onError) onError(error);
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    if (onClose) onClose();
  };

  return ws;
}
