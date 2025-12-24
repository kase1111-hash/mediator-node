<script>
  import { onMount } from 'svelte';
  import { getReputation, getReputationHistory } from '../lib/api.js';
  import Tooltip from './Tooltip.svelte';
  import { ncipDefinitions } from '../lib/ncip-definitions.js';

  let reputation = null;
  let history = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    await loadReputation();
  });

  async function loadReputation() {
    loading = true;
    error = null;
    try {
      const [repData, histData] = await Promise.all([
        getReputation().catch(() => null),
        getReputationHistory().catch(() => ({ history: [] })),
      ]);
      reputation = repData;
      history = histData?.history || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function getWeightClass(weight) {
    if (weight >= 0.3) return 'excellent';
    if (weight >= 0.2) return 'good';
    if (weight >= 0.1) return 'moderate';
    return 'low';
  }
</script>

<div class="reputation">
  <h2>Mediator Reputation</h2>

  {#if loading}
    <div class="loading">Loading reputation data...</div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button on:click={loadReputation}>Retry</button>
    </div>
  {:else if reputation}
    <div class="content-wrapper">
      <div class="weight-card">
        <Tooltip text={ncipDefinitions.reputationWeight.text} ncipRef="NCIP-010" position="bottom">
          <div class="weight-display {getWeightClass(reputation.weight)}">
            <span class="weight-value">{reputation.weight?.toFixed(3) || '0.000'}</span>
            <span class="weight-label">Reputation Weight</span>
            <span class="weight-max">Max: 0.350</span>
          </div>
        </Tooltip>

        <div class="weight-bar">
          <div class="weight-fill" style="width: {Math.min(reputation.weight / 0.35 * 100, 100)}%"></div>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card positive">
          <Tooltip text={ncipDefinitions.successfulClosures.text} ncipRef="NCIP-010" position="bottom">
            <div class="metric-icon">✅</div>
            <div class="metric-value">{reputation.successfulClosures || 0}</div>
            <div class="metric-label">Successful Closures</div>
            <div class="metric-impact">+{reputation.successfulClosures || 0} to numerator</div>
          </Tooltip>
        </div>

        <div class="metric-card positive">
          <Tooltip text={ncipDefinitions.failedChallenges.text} ncipRef="NCIP-010" position="bottom">
            <div class="metric-icon">🛡️</div>
            <div class="metric-value">{reputation.failedChallenges || 0}</div>
            <div class="metric-label">Failed Challenges</div>
            <div class="metric-impact">+{(reputation.failedChallenges || 0) * 2} to numerator (x2)</div>
          </Tooltip>
        </div>

        <div class="metric-card negative">
          <Tooltip text={ncipDefinitions.upheldChallenges.text} ncipRef="NCIP-010" position="bottom">
            <div class="metric-icon">⚠️</div>
            <div class="metric-value">{reputation.upheldChallengesAgainst || 0}</div>
            <div class="metric-label">Upheld Challenges</div>
            <div class="metric-impact">+{reputation.upheldChallengesAgainst || 0} to denominator</div>
          </Tooltip>
        </div>

        <div class="metric-card negative">
          <Tooltip text="Facilitation fees forfeited due to settlement rejection." ncipRef="NCIP-010" position="bottom">
            <div class="metric-icon">💸</div>
            <div class="metric-value">{reputation.forfeitedFees || 0}</div>
            <div class="metric-label">Forfeited Fees</div>
            <div class="metric-impact">+{reputation.forfeitedFees || 0} to denominator</div>
          </Tooltip>
        </div>
      </div>

      <div class="formula-panel">
        <h3>Reputation Formula</h3>
        <Tooltip text={ncipDefinitions.compositeScore.text} ncipRef="NCIP-010" position="top">
          <div class="formula">
            <div class="formula-line">
              <span class="formula-part numerator">
                ({reputation.successfulClosures || 0} + {(reputation.failedChallenges || 0) * 2})
              </span>
            </div>
            <div class="formula-divider"></div>
            <div class="formula-line">
              <span class="formula-part denominator">
                (1 + {reputation.upheldChallengesAgainst || 0} + {reputation.forfeitedFees || 0})
              </span>
            </div>
            <div class="formula-equals">=</div>
            <div class="formula-result">{reputation.weight?.toFixed(3) || '0.000'}</div>
          </div>
        </Tooltip>
      </div>

      <div class="panels-row">
        <div class="panel">
          <h3>Slashing Conditions</h3>
          <Tooltip text={ncipDefinitions.slashing.text} ncipRef="NCIP-010" position="right">
            <div class="slashing-info">
              <p>Automatic, deterministic penalties:</p>
            </div>
          </Tooltip>
          <div class="slashing-grid">
            <div class="slash-item">
              <span class="slash-offense">Semantic Manipulation (D4)</span>
              <span class="slash-penalty">10-30% bond</span>
            </div>
            <div class="slash-item">
              <span class="slash-offense">Repeated Invalid Proposals (3x)</span>
              <span class="slash-penalty">5-15% bond</span>
            </div>
            <div class="slash-item">
              <span class="slash-offense">Coercive Framing</span>
              <span class="slash-penalty">15% bond</span>
            </div>
            <div class="slash-item">
              <span class="slash-offense">Appeal Reversal</span>
              <span class="slash-penalty">5-20% bond</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3>Recent History</h3>
          {#if history.length === 0}
            <p class="empty">No reputation history available</p>
          {:else}
            <div class="history-list">
              {#each history.slice(0, 10) as event}
                <div class="history-item" class:positive={event.change > 0} class:negative={event.change < 0}>
                  <span class="history-event">{event.type}</span>
                  <span class="history-change">{event.change > 0 ? '+' : ''}{event.change?.toFixed(3)}</span>
                  <span class="history-date">{new Date(event.timestamp).toLocaleDateString()}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="info-banner">
        <Tooltip text="Trust is earned only through on-chain behavior. No mediator has authority, can finalize agreements, or override parties." ncipRef="NCIP-010" position="top">
          <p>
            <strong>Core Principle:</strong> Mediators earn influence only by being repeatedly correct, aligned, and non-coercive.
            Reputation affects proposal visibility, validator weighting, and market selection probability.
          </p>
        </Tooltip>
      </div>
    </div>
  {:else}
    <div class="empty">
      <p>Reputation data unavailable. Connect to mediator node to view.</p>
    </div>
  {/if}
</div>

<style>
  .reputation {
    max-width: 1000px;
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

  .loading, .error, .empty {
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

  .weight-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px;
    text-align: center;
    margin-bottom: 24px;
  }

  .weight-display {
    margin-bottom: 20px;
  }

  .weight-value {
    display: block;
    font-size: 4rem;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 8px;
  }

  .weight-display.excellent .weight-value { color: #22c55e; }
  .weight-display.good .weight-value { color: #84cc16; }
  .weight-display.moderate .weight-value { color: #f59e0b; }
  .weight-display.low .weight-value { color: #ef4444; }

  .weight-label {
    display: block;
    color: #a1a1aa;
    font-size: 1rem;
    margin-bottom: 4px;
  }

  .weight-max {
    color: #71717a;
    font-size: 0.875rem;
  }

  .weight-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .weight-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    border-radius: 4px;
    transition: width 0.5s ease;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .metric-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }

  .metric-card.positive {
    border-color: rgba(34, 197, 94, 0.2);
  }

  .metric-card.negative {
    border-color: rgba(239, 68, 68, 0.2);
  }

  .metric-icon {
    font-size: 2rem;
    margin-bottom: 8px;
  }

  .metric-value {
    font-size: 2rem;
    font-weight: 700;
    color: #e4e4e7;
  }

  .metric-label {
    color: #a1a1aa;
    font-size: 0.875rem;
    margin-bottom: 8px;
  }

  .metric-impact {
    font-size: 0.75rem;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .metric-card.positive .metric-impact {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }

  .metric-card.negative .metric-impact {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .formula-panel {
    background: rgba(102, 126, 234, 0.1);
    border: 1px solid rgba(102, 126, 234, 0.2);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    text-align: center;
  }

  .formula {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    font-family: monospace;
    font-size: 1.25rem;
  }

  .formula-part {
    padding: 8px 16px;
    border-radius: 6px;
  }

  .numerator {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }

  .denominator {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .formula-divider {
    width: 100px;
    height: 2px;
    background: #a1a1aa;
  }

  .formula-equals {
    color: #a1a1aa;
    font-size: 1.5rem;
  }

  .formula-result {
    font-size: 1.5rem;
    font-weight: 700;
    color: #667eea;
  }

  .panels-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }

  .panel {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
  }

  .slashing-info p {
    color: #a1a1aa;
    margin-bottom: 12px;
  }

  .slashing-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .slash-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.05);
    border-radius: 6px;
  }

  .slash-offense {
    color: #a1a1aa;
    font-size: 0.875rem;
  }

  .slash-penalty {
    color: #ef4444;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .history-event {
    color: #a1a1aa;
  }

  .history-change {
    font-weight: 600;
  }

  .history-item.positive .history-change { color: #22c55e; }
  .history-item.negative .history-change { color: #ef4444; }

  .history-date {
    color: #71717a;
    font-size: 0.75rem;
  }

  .info-banner {
    background: rgba(102, 126, 234, 0.1);
    border: 1px solid rgba(102, 126, 234, 0.2);
    border-radius: 12px;
    padding: 20px;
  }

  .info-banner p {
    color: #a1a1aa;
    line-height: 1.6;
  }

  .info-banner strong {
    color: #667eea;
  }

  @media (max-width: 900px) {
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .panels-row {
      grid-template-columns: 1fr;
    }

    .formula {
      flex-direction: column;
      gap: 8px;
    }

    .formula-divider {
      width: 60px;
    }
  }
</style>
