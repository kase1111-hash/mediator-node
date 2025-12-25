<script>
  import { onMount } from 'svelte';
  import { getStats, getReputation, getActiveSettlements, getPendingIntents } from '../lib/api.js';
  import Tooltip from './Tooltip.svelte';
  import { ncipDefinitions } from '../lib/ncip-definitions.js';

  let stats = null;
  let reputation = null;
  let activeSettlements = [];
  let pendingIntents = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    await loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    error = null;
    try {
      const [statsData, repData, settlementsData, intentsData] = await Promise.all([
        getStats().catch(() => null),
        getReputation().catch(() => null),
        getActiveSettlements().catch(() => ({ settlements: [] })),
        getPendingIntents().catch(() => ({ intents: [] })),
      ]);
      stats = statsData;
      reputation = repData;
      activeSettlements = settlementsData?.settlements || [];
      pendingIntents = intentsData?.intents || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function formatPercent(num) {
    if (num === null || num === undefined) return '—';
    return (num * 100).toFixed(1) + '%';
  }
</script>

<div class="dashboard">
  <h2>Dashboard</h2>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading mediator data...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>Error loading data: {error}</p>
      <button on:click={loadDashboard}>Retry</button>
    </div>
  {:else}
    <div class="stats-grid">
      <Tooltip text={ncipDefinitions.activeSettlements.text} ncipRef={ncipDefinitions.activeSettlements.ncipRef} position="bottom">
        <div class="stat-card">
          <div class="stat-icon">🤝</div>
          <div class="stat-content">
            <div class="stat-value">{activeSettlements.length}</div>
            <div class="stat-label">Active Settlements</div>
          </div>
        </div>
      </Tooltip>

      <Tooltip text={ncipDefinitions.pendingIntents.text} ncipRef={ncipDefinitions.pendingIntents.ncipRef} position="bottom">
        <div class="stat-card">
          <div class="stat-icon">💭</div>
          <div class="stat-content">
            <div class="stat-value">{pendingIntents.length}</div>
            <div class="stat-label">Pending Intents</div>
          </div>
        </div>
      </Tooltip>

      <Tooltip text={ncipDefinitions.reputationWeight.text} ncipRef={ncipDefinitions.reputationWeight.ncipRef} position="bottom">
        <div class="stat-card highlight">
          <div class="stat-icon">⭐</div>
          <div class="stat-content">
            <div class="stat-value">{reputation?.weight?.toFixed(3) || '—'}</div>
            <div class="stat-label">Reputation Weight</div>
          </div>
        </div>
      </Tooltip>

      <Tooltip text={ncipDefinitions.consensusMode.text} ncipRef={ncipDefinitions.consensusMode.ncipRef} position="bottom">
        <div class="stat-card">
          <div class="stat-icon">🔗</div>
          <div class="stat-content">
            <div class="stat-value mode">{stats?.consensusMode || '—'}</div>
            <div class="stat-label">Consensus Mode</div>
          </div>
        </div>
      </Tooltip>

      <Tooltip text={ncipDefinitions.successfulClosures.text} ncipRef={ncipDefinitions.successfulClosures.ncipRef} position="bottom">
        <div class="stat-card success">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-value">{formatNumber(reputation?.successfulClosures)}</div>
            <div class="stat-label">Successful Closures</div>
          </div>
        </div>
      </Tooltip>

      <Tooltip text={ncipDefinitions.challengeRate.text} ncipRef={ncipDefinitions.challengeRate.ncipRef} position="bottom">
        <div class="stat-card" class:warning={stats?.challengeRate > 0.1}>
          <div class="stat-icon">⚠️</div>
          <div class="stat-content">
            <div class="stat-value">{formatPercent(stats?.challengeRate)}</div>
            <div class="stat-label">Challenge Rate</div>
          </div>
        </div>
      </Tooltip>

      <Tooltip text={ncipDefinitions.totalBurned.text} ncipRef={ncipDefinitions.totalBurned.ncipRef} position="bottom">
        <div class="stat-card">
          <div class="stat-icon">🔥</div>
          <div class="stat-content">
            <div class="stat-value">{formatNumber(stats?.totalBurned)} NLC</div>
            <div class="stat-label">Total Burned</div>
          </div>
        </div>
      </Tooltip>

      <Tooltip text={ncipDefinitions.facilitationFee.text} ncipRef={ncipDefinitions.facilitationFee.ncipRef} position="bottom">
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-content">
            <div class="stat-value">{formatNumber(stats?.totalFeesEarned)} NLC</div>
            <div class="stat-label">Fees Earned</div>
          </div>
        </div>
      </Tooltip>
    </div>

    <div class="panels">
      <div class="panel">
        <h3>Recent Activity</h3>
        <div class="activity-list">
          {#if activeSettlements.length === 0}
            <p class="empty">No active settlements</p>
          {:else}
            {#each activeSettlements.slice(0, 5) as settlement}
              <div class="activity-item">
                <span class="activity-icon">🤝</span>
                <div class="activity-content">
                  <span class="activity-title">Settlement #{settlement.id?.slice(0, 8)}</span>
                  <span class="activity-meta">
                    {settlement.status} • {new Date(settlement.timestamp).toLocaleString()}
                  </span>
                </div>
                <span class="activity-value">{settlement.proposedTerms?.price || '—'} NLC</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <div class="panel">
        <h3>Reputation Breakdown</h3>
        {#if reputation}
          <div class="reputation-grid">
            <div class="rep-item">
              <span class="rep-label">Successful Closures</span>
              <span class="rep-value positive">+{reputation.successfulClosures || 0}</span>
            </div>
            <div class="rep-item">
              <span class="rep-label">Failed Challenges (x2)</span>
              <span class="rep-value positive">+{(reputation.failedChallenges || 0) * 2}</span>
            </div>
            <div class="rep-item">
              <span class="rep-label">Upheld Challenges Against</span>
              <span class="rep-value negative">-{reputation.upheldChallengesAgainst || 0}</span>
            </div>
            <div class="rep-item">
              <span class="rep-label">Forfeited Fees</span>
              <span class="rep-value negative">-{reputation.forfeitedFees || 0}</span>
            </div>
            <div class="rep-formula">
              <Tooltip text={ncipDefinitions.reputationWeight.text} ncipRef="NCIP-010" position="top">
                <span>Weight = ({reputation.successfulClosures || 0} + {(reputation.failedChallenges || 0) * 2}) / (1 + {reputation.upheldChallengesAgainst || 0} + {reputation.forfeitedFees || 0}) = <strong>{reputation.weight?.toFixed(3) || '—'}</strong></span>
              </Tooltip>
            </div>
          </div>
        {:else}
          <p class="empty">Reputation data unavailable</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    max-width: 1200px;
    margin: 0 auto;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 24px;
    color: #e4e4e7;
  }

  .loading {
    text-align: center;
    padding: 60px;
    color: #a1a1aa;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(102, 126, 234, 0.3);
    border-top-color: #667eea;
    border-radius: 50%;
    margin: 0 auto 16px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }

  .error button {
    margin-top: 12px;
    padding: 8px 16px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: transform 0.2s ease;
    cursor: default;
  }

  .stat-card:hover {
    transform: translateY(-2px);
  }

  .stat-card.highlight {
    border-color: rgba(102, 126, 234, 0.3);
    background: rgba(102, 126, 234, 0.1);
  }

  .stat-card.success {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.1);
  }

  .stat-card.warning {
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.1);
  }

  .stat-icon {
    font-size: 2rem;
  }

  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: #e4e4e7;
  }

  .stat-value.mode {
    font-size: 1.25rem;
    text-transform: capitalize;
  }

  .stat-label {
    color: #a1a1aa;
    font-size: 0.875rem;
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 24px;
  }

  .panel {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
  }

  .panel h3 {
    margin-bottom: 16px;
    color: #e4e4e7;
    font-size: 1.125rem;
  }

  .empty {
    color: #71717a;
    text-align: center;
    padding: 20px;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
  }

  .activity-icon {
    font-size: 1.25rem;
  }

  .activity-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .activity-title {
    color: #e4e4e7;
    font-weight: 500;
  }

  .activity-meta {
    color: #71717a;
    font-size: 0.75rem;
    text-transform: capitalize;
  }

  .activity-value {
    color: #667eea;
    font-weight: 600;
  }

  .reputation-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .rep-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .rep-label {
    color: #a1a1aa;
  }

  .rep-value {
    font-weight: 600;
  }

  .rep-value.positive {
    color: #22c55e;
  }

  .rep-value.negative {
    color: #ef4444;
  }

  .rep-formula {
    margin-top: 12px;
    padding: 12px;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 8px;
    font-family: monospace;
    font-size: 0.875rem;
    color: #a1a1aa;
  }

  .rep-formula strong {
    color: #667eea;
  }

  @media (max-width: 600px) {
    .panels {
      grid-template-columns: 1fr;
    }
  }
</style>
