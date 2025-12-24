<script>
  import { onMount } from 'svelte';
  import { getConfig, getStats } from '../lib/api.js';
  import Tooltip from './Tooltip.svelte';
  import { ncipDefinitions } from '../lib/ncip-definitions.js';

  let config = null;
  let stats = null;
  let loading = true;
  let error = null;

  onMount(async () => {
    await loadConfig();
  });

  async function loadConfig() {
    loading = true;
    error = null;
    try {
      const [configData, statsData] = await Promise.all([
        getConfig().catch(() => null),
        getStats().catch(() => null),
      ]);
      config = configData;
      stats = statsData;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function formatBoolean(val) {
    return val ? 'Enabled' : 'Disabled';
  }
</script>

<div class="configuration">
  <h2>Configuration</h2>

  {#if loading}
    <div class="loading">Loading configuration...</div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button on:click={loadConfig}>Retry</button>
    </div>
  {:else}
    <div class="config-grid">
      <div class="config-section">
        <h3>Chain Connection</h3>
        <div class="config-item">
          <span class="config-label">Chain Endpoint</span>
          <span class="config-value mono">{config?.chainEndpoint || '—'}</span>
        </div>
        <div class="config-item">
          <span class="config-label">Chain ID</span>
          <span class="config-value">{config?.chainId || '—'}</span>
        </div>
        <div class="config-item">
          <Tooltip text={ncipDefinitions.consensusMode.text} ncipRef="NCIP-007" position="right">
            <span class="config-label">Consensus Mode</span>
          </Tooltip>
          <span class="config-value highlight">{config?.consensusMode || '—'}</span>
        </div>
      </div>

      <div class="config-section">
        <h3>Mediator Identity</h3>
        <div class="config-item">
          <span class="config-label">Public Key</span>
          <span class="config-value mono">{config?.mediatorPublicKey?.slice(0, 24) || '—'}...</span>
        </div>
        <div class="config-item">
          <Tooltip text={ncipDefinitions.facilitationFee.text} ncipRef="MP-01" position="right">
            <span class="config-label">Facilitation Fee</span>
          </Tooltip>
          <span class="config-value">{config?.facilitationFeePercent || '—'}%</span>
        </div>
        <div class="config-item">
          <span class="config-label">Acceptance Window</span>
          <span class="config-value">{config?.acceptanceWindowHours || 72} hours</span>
        </div>
      </div>

      <div class="config-section">
        <h3>LLM Configuration</h3>
        <div class="config-item">
          <span class="config-label">Provider</span>
          <span class="config-value">{config?.llmProvider || '—'}</span>
        </div>
        <div class="config-item">
          <span class="config-label">Model</span>
          <span class="config-value">{config?.llmModel || '—'}</span>
        </div>
      </div>

      <div class="config-section">
        <h3>Consensus Settings</h3>
        {#if config?.consensusMode === 'dpos' || config?.consensusMode === 'hybrid'}
          <div class="config-item">
            <span class="config-label">Bonded Stake</span>
            <span class="config-value">{config?.bondedStakeAmount || '—'} NLC</span>
          </div>
          <div class="config-item">
            <span class="config-label">Min Effective Stake</span>
            <span class="config-value">{config?.minEffectiveStake || '—'} NLC</span>
          </div>
        {/if}
        {#if config?.consensusMode === 'poa' || config?.consensusMode === 'hybrid'}
          <div class="config-item">
            <span class="config-label">Authority Status</span>
            <span class="config-value">{config?.isAuthority ? 'Authorized' : 'Not Authorized'}</span>
          </div>
        {/if}
        {#if config?.consensusMode === 'permissionless'}
          <div class="config-item">
            <span class="config-label">Mode</span>
            <span class="config-value">Reputation-based (no stake required)</span>
          </div>
        {/if}
      </div>

      <div class="config-section">
        <h3>Protocol Features</h3>
        <div class="feature-grid">
          <Tooltip text={ncipDefinitions.semanticVerification.text} ncipRef="NCIP-007" position="bottom">
            <div class="feature-item" class:enabled={config?.enableSemanticConsensus}>
              <span class="feature-icon">{config?.enableSemanticConsensus ? '✅' : '❌'}</span>
              <span class="feature-name">Semantic Consensus</span>
            </div>
          </Tooltip>

          <div class="feature-item" class:enabled={config?.enableSybilResistance}>
            <span class="feature-icon">{config?.enableSybilResistance ? '✅' : '❌'}</span>
            <span class="feature-name">Sybil Resistance</span>
          </div>

          <Tooltip text={ncipDefinitions.effortReceipt.text} ncipRef="MP-02" position="bottom">
            <div class="feature-item" class:enabled={config?.enableEffortCapture}>
              <span class="feature-icon">{config?.enableEffortCapture ? '✅' : '❌'}</span>
              <span class="feature-name">Effort Capture</span>
            </div>
          </Tooltip>

          <Tooltip text={ncipDefinitions.dispute.text} ncipRef="MP-03" position="bottom">
            <div class="feature-item" class:enabled={config?.enableDisputeSystem}>
              <span class="feature-icon">{config?.enableDisputeSystem ? '✅' : '❌'}</span>
              <span class="feature-name">Dispute System</span>
            </div>
          </Tooltip>

          <Tooltip text={ncipDefinitions.license.text} ncipRef="MP-04" position="bottom">
            <div class="feature-item" class:enabled={config?.enableLicensingSystem}>
              <span class="feature-icon">{config?.enableLicensingSystem ? '✅' : '❌'}</span>
              <span class="feature-name">Licensing</span>
            </div>
          </Tooltip>

          <div class="feature-item" class:enabled={config?.enableSettlementSystem}>
            <span class="feature-icon">{config?.enableSettlementSystem ? '✅' : '❌'}</span>
            <span class="feature-name">Settlement</span>
          </div>

          <div class="feature-item" class:enabled={config?.enableGovernance}>
            <span class="feature-icon">{config?.enableGovernance ? '✅' : '❌'}</span>
            <span class="feature-name">Governance</span>
          </div>

          <div class="feature-item" class:enabled={config?.enableWebSocket}>
            <span class="feature-icon">{config?.enableWebSocket ? '✅' : '❌'}</span>
            <span class="feature-name">WebSocket</span>
          </div>
        </div>
      </div>

      <div class="config-section wide">
        <h3>Thresholds & Limits</h3>
        <div class="thresholds-grid">
          <div class="threshold-item">
            <span class="threshold-label">High Value Threshold</span>
            <span class="threshold-value">{config?.highValueThreshold || '—'} NLC</span>
          </div>
          <div class="threshold-item">
            <span class="threshold-label">Auto-Accept Threshold</span>
            <span class="threshold-value">{config?.autoAcceptThreshold || '—'}</span>
          </div>
          <div class="threshold-item">
            <span class="threshold-label">Required Consensus</span>
            <span class="threshold-value">{config?.requiredConsensus || 3} verifiers</span>
          </div>
          <div class="threshold-item">
            <span class="threshold-label">Similarity Threshold</span>
            <span class="threshold-value">{((config?.semanticSimilarityThreshold || 0.85) * 100).toFixed(0)}%</span>
          </div>
          <div class="threshold-item">
            <span class="threshold-label">Daily Free Limit</span>
            <span class="threshold-value">{config?.dailyFreeLimit || 3} intents</span>
          </div>
          <div class="threshold-item">
            <span class="threshold-label">Excess Deposit</span>
            <span class="threshold-value">{config?.excessDepositAmount || 100} NLC</span>
          </div>
        </div>
      </div>
    </div>

    <div class="node-info">
      <h3>Node Status</h3>
      <div class="status-grid">
        <div class="status-item">
          <span class="status-label">Uptime</span>
          <span class="status-value">{stats?.uptime || '—'}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Total Settlements</span>
          <span class="status-value">{stats?.totalSettlements || 0}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Active Connections</span>
          <span class="status-value">{stats?.activeConnections || 0}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Log Level</span>
          <span class="status-value">{config?.logLevel || 'info'}</span>
        </div>
      </div>
    </div>

    <div class="docs-link">
      <p>
        For configuration changes, edit the <code>.env</code> file and restart the mediator node.
        See <a href="https://github.com/kase1111-hash/mediator-node" target="_blank">documentation</a> for details.
      </p>
    </div>
  {/if}
</div>

<style>
  .configuration {
    max-width: 1200px;
    margin: 0 auto;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 24px;
    color: #e4e4e7;
  }

  h3 {
    color: #e4e4e7;
    margin-bottom: 16px;
    font-size: 1.125rem;
  }

  .loading, .error {
    text-align: center;
    padding: 40px;
    color: #a1a1aa;
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

  .config-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    margin-bottom: 24px;
  }

  .config-section {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
  }

  .config-section.wide {
    grid-column: span 2;
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .config-item:last-child {
    border-bottom: none;
  }

  .config-label {
    color: #a1a1aa;
  }

  .config-value {
    color: #e4e4e7;
    font-weight: 500;
  }

  .config-value.mono {
    font-family: monospace;
    font-size: 0.875rem;
  }

  .config-value.highlight {
    color: #667eea;
    text-transform: capitalize;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .feature-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    text-align: center;
  }

  .feature-item.enabled {
    border-color: rgba(34, 197, 94, 0.2);
    background: rgba(34, 197, 94, 0.05);
  }

  .feature-icon {
    font-size: 1.5rem;
    margin-bottom: 8px;
  }

  .feature-name {
    font-size: 0.75rem;
    color: #a1a1aa;
  }

  .thresholds-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .threshold-item {
    text-align: center;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
  }

  .threshold-label {
    display: block;
    font-size: 0.75rem;
    color: #71717a;
    margin-bottom: 8px;
  }

  .threshold-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #e4e4e7;
  }

  .node-info {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .status-item {
    text-align: center;
  }

  .status-label {
    display: block;
    font-size: 0.75rem;
    color: #71717a;
    margin-bottom: 4px;
  }

  .status-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: #e4e4e7;
  }

  .docs-link {
    background: rgba(102, 126, 234, 0.1);
    border: 1px solid rgba(102, 126, 234, 0.2);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }

  .docs-link p {
    color: #a1a1aa;
  }

  .docs-link code {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    color: #e4e4e7;
  }

  .docs-link a {
    color: #667eea;
    text-decoration: none;
  }

  .docs-link a:hover {
    text-decoration: underline;
  }

  @media (max-width: 900px) {
    .config-grid {
      grid-template-columns: 1fr;
    }

    .config-section.wide {
      grid-column: span 1;
    }

    .feature-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .thresholds-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .status-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
