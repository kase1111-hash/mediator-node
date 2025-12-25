<script>
  import { onMount } from 'svelte';
  import { getPendingIntents, getAlignmentCandidates } from '../lib/api.js';
  import Tooltip from './Tooltip.svelte';
  import { ncipDefinitions } from '../lib/ncip-definitions.js';

  let pendingIntents = [];
  let candidates = [];
  let loading = true;
  let error = null;
  let selectedIntent = null;

  onMount(async () => {
    await loadIntents();
  });

  async function loadIntents() {
    loading = true;
    error = null;
    try {
      const [intentsData, candidatesData] = await Promise.all([
        getPendingIntents().catch(() => ({ intents: [] })),
        getAlignmentCandidates().catch(() => ({ candidates: [] })),
      ]);
      pendingIntents = intentsData?.intents || [];
      candidates = candidatesData?.candidates || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'accepted': return 'status-success';
      case 'rejected': return 'status-error';
      case 'closed': return 'status-closed';
      case 'unalignable': return 'status-warning';
      default: return '';
    }
  }

  function selectIntent(intent) {
    selectedIntent = selectedIntent?.hash === intent.hash ? null : intent;
  }
</script>

<div class="intents">
  <h2>Pending Intents</h2>

  {#if loading}
    <div class="loading">Loading intents...</div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button on:click={loadIntents}>Retry</button>
    </div>
  {:else}
    <div class="content-wrapper">
      <div class="intents-list">
        <h3>Intents ({pendingIntents.length})</h3>
        {#if pendingIntents.length === 0}
          <div class="empty">
            <p>No pending intents to align</p>
          </div>
        {:else}
          {#each pendingIntents as intent}
            <div
              class="intent-card"
              class:selected={selectedIntent?.hash === intent.hash}
              on:click={() => selectIntent(intent)}
              on:keydown={(e) => e.key === 'Enter' && selectIntent(intent)}
              role="button"
              tabindex="0"
            >
              <div class="intent-header">
                <span class="intent-hash">{intent.hash?.slice(0, 12)}...</span>
                <span class="status {getStatusClass(intent.status)}">{intent.status}</span>
              </div>
              <p class="intent-prose">{intent.prose?.slice(0, 100)}{intent.prose?.length > 100 ? '...' : ''}</p>
              <div class="intent-meta">
                <span class="author">By: {intent.author?.slice(0, 12)}...</span>
                <span class="date">{new Date(intent.timestamp).toLocaleDateString()}</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="detail-panel">
        {#if selectedIntent}
          <h3>Intent Details</h3>

          <div class="detail-section">
            <h4>Identifier</h4>
            <div class="detail-row">
              <span class="label">Hash</span>
              <span class="value mono">{selectedIntent.hash}</span>
            </div>
            <div class="detail-row">
              <span class="label">Author</span>
              <span class="value mono">{selectedIntent.author}</span>
            </div>
            <div class="detail-row">
              <span class="label">Status</span>
              <span class="value">{selectedIntent.status}</span>
            </div>
            {#if selectedIntent.branch}
              <div class="detail-row">
                <span class="label">Branch</span>
                <span class="value">{selectedIntent.branch}</span>
              </div>
            {/if}
          </div>

          <div class="detail-section">
            <Tooltip text={ncipDefinitions.intent.text} ncipRef={ncipDefinitions.intent.ncipRef} position="left">
              <h4>Prose</h4>
            </Tooltip>
            <p class="prose-content">{selectedIntent.prose}</p>
          </div>

          <div class="detail-section">
            <Tooltip text={ncipDefinitions.desires.text} ncipRef={ncipDefinitions.desires.ncipRef} position="left">
              <h4>Desires</h4>
            </Tooltip>
            {#if selectedIntent.desires?.length}
              <ul class="list">
                {#each selectedIntent.desires as desire}
                  <li class="desire">{desire}</li>
                {/each}
              </ul>
            {:else}
              <p class="empty-text">No explicit desires listed</p>
            {/if}
          </div>

          <div class="detail-section">
            <Tooltip text={ncipDefinitions.constraints.text} ncipRef={ncipDefinitions.constraints.ncipRef} position="left">
              <h4>Constraints</h4>
            </Tooltip>
            {#if selectedIntent.constraints?.length}
              <ul class="list">
                {#each selectedIntent.constraints as constraint}
                  <li class="constraint">{constraint}</li>
                {/each}
              </ul>
            {:else}
              <p class="empty-text">No explicit constraints listed</p>
            {/if}
          </div>

          {#if selectedIntent.offeredFee}
            <div class="detail-section">
              <h4>Offered Fee</h4>
              <div class="fee-display">{selectedIntent.offeredFee} NLC</div>
            </div>
          {/if}
        {:else}
          <div class="no-selection">
            <p>Select an intent to view details</p>
          </div>
        {/if}
      </div>

      <div class="candidates-panel">
        <h3>Alignment Candidates</h3>
        <Tooltip text="Intent pairs with high semantic similarity that may be aligned into settlements." ncipRef="NCIP-002" position="bottom">
          <p class="subtitle">Potential matches for settlement</p>
        </Tooltip>
        {#if candidates.length === 0}
          <div class="empty">
            <p>No alignment candidates found</p>
          </div>
        {:else}
          {#each candidates as candidate}
            <div class="candidate-card">
              <div class="candidate-pair">
                <span class="intent-ref">{candidate.intentA?.hash?.slice(0, 8)}...</span>
                <span class="arrow">↔</span>
                <span class="intent-ref">{candidate.intentB?.hash?.slice(0, 8)}...</span>
              </div>
              <div class="candidate-meta">
                <div class="score">
                  <span class="score-label">Similarity</span>
                  <span class="score-value">{(candidate.similarityScore * 100).toFixed(1)}%</span>
                </div>
                <div class="score">
                  <span class="score-label">Est. Value</span>
                  <span class="score-value">{candidate.estimatedValue} NLC</span>
                </div>
                <div class="score">
                  <span class="score-label">Priority</span>
                  <span class="score-value">{candidate.priority}</span>
                </div>
              </div>
              {#if candidate.reason}
                <p class="candidate-reason">{candidate.reason}</p>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .intents {
    max-width: 1400px;
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
  }

  .subtitle {
    color: #71717a;
    font-size: 0.875rem;
    margin-top: -12px;
    margin-bottom: 16px;
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

  .content-wrapper {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
  }

  .intents-list, .detail-panel, .candidates-panel {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .intent-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .intent-card:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .intent-card.selected {
    border-color: #667eea;
    background: rgba(102, 126, 234, 0.1);
  }

  .intent-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .intent-hash {
    font-family: monospace;
    color: #667eea;
    font-size: 0.875rem;
  }

  .status {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-pending { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .status-success { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
  .status-error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
  .status-warning { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .status-closed { background: rgba(113, 113, 122, 0.2); color: #71717a; }

  .intent-prose {
    color: #a1a1aa;
    font-size: 0.875rem;
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .intent-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #71717a;
  }

  .detail-section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .detail-section h4 {
    color: #a1a1aa;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
  }

  .label {
    color: #71717a;
    font-size: 0.875rem;
  }

  .value {
    color: #e4e4e7;
    font-size: 0.875rem;
  }

  .value.mono {
    font-family: monospace;
    font-size: 0.75rem;
    word-break: break-all;
    text-align: right;
    max-width: 60%;
  }

  .prose-content {
    color: #e4e4e7;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .list {
    list-style: none;
    padding: 0;
  }

  .list li {
    padding: 8px 12px;
    margin-bottom: 8px;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .desire {
    background: rgba(34, 197, 94, 0.1);
    border-left: 3px solid #22c55e;
    color: #e4e4e7;
  }

  .constraint {
    background: rgba(239, 68, 68, 0.1);
    border-left: 3px solid #ef4444;
    color: #e4e4e7;
  }

  .empty-text {
    color: #71717a;
    font-size: 0.875rem;
    font-style: italic;
  }

  .fee-display {
    font-size: 1.5rem;
    font-weight: 700;
    color: #22c55e;
  }

  .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #71717a;
  }

  .candidate-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }

  .candidate-pair {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .intent-ref {
    font-family: monospace;
    color: #667eea;
    font-size: 0.875rem;
  }

  .arrow {
    color: #a1a1aa;
  }

  .candidate-meta {
    display: flex;
    justify-content: space-around;
    margin-bottom: 8px;
  }

  .score {
    text-align: center;
  }

  .score-label {
    display: block;
    font-size: 0.7rem;
    color: #71717a;
    text-transform: uppercase;
  }

  .score-value {
    font-weight: 600;
    color: #e4e4e7;
  }

  .candidate-reason {
    font-size: 0.75rem;
    color: #a1a1aa;
    font-style: italic;
    text-align: center;
  }

  @media (max-width: 1100px) {
    .content-wrapper {
      grid-template-columns: 1fr 1fr;
    }
    .candidates-panel {
      grid-column: span 2;
    }
  }

  @media (max-width: 700px) {
    .content-wrapper {
      grid-template-columns: 1fr;
    }
    .candidates-panel {
      grid-column: span 1;
    }
  }
</style>
