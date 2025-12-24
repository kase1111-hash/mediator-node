<script>
  import { onMount } from 'svelte';
  import { getActiveSettlements, getSettlementHistory, getChallengedSettlements } from '../lib/api.js';
  import Tooltip from './Tooltip.svelte';
  import { ncipDefinitions } from '../lib/ncip-definitions.js';

  let activeSettlements = [];
  let historySettlements = [];
  let challengedSettlements = [];
  let loading = true;
  let error = null;
  let selectedTab = 'active';
  let selectedSettlement = null;

  onMount(async () => {
    await loadSettlements();
  });

  async function loadSettlements() {
    loading = true;
    error = null;
    try {
      const [active, history, challenged] = await Promise.all([
        getActiveSettlements().catch(() => ({ settlements: [] })),
        getSettlementHistory().catch(() => ({ settlements: [] })),
        getChallengedSettlements().catch(() => ({ settlements: [] })),
      ]);
      activeSettlements = active?.settlements || [];
      historySettlements = history?.settlements || [];
      challengedSettlements = challenged?.settlements || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case 'proposed': return 'status-pending';
      case 'accepted': return 'status-success';
      case 'rejected': return 'status-error';
      case 'closed': return 'status-closed';
      case 'challenged': return 'status-warning';
      default: return '';
    }
  }

  function selectSettlement(settlement) {
    selectedSettlement = selectedSettlement?.id === settlement.id ? null : settlement;
  }

  $: currentSettlements = selectedTab === 'active' ? activeSettlements :
                          selectedTab === 'challenged' ? challengedSettlements :
                          historySettlements;
</script>

<div class="settlements">
  <div class="header">
    <h2>Settlements</h2>
    <div class="tabs">
      <button class:active={selectedTab === 'active'} on:click={() => selectedTab = 'active'}>
        Active ({activeSettlements.length})
      </button>
      <button class:active={selectedTab === 'challenged'} on:click={() => selectedTab = 'challenged'}>
        Challenged ({challengedSettlements.length})
      </button>
      <button class:active={selectedTab === 'history'} on:click={() => selectedTab = 'history'}>
        History
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading settlements...</div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button on:click={loadSettlements}>Retry</button>
    </div>
  {:else}
    <div class="content-wrapper">
      <div class="settlements-list">
        {#if currentSettlements.length === 0}
          <div class="empty">
            <p>No {selectedTab} settlements</p>
          </div>
        {:else}
          {#each currentSettlements as settlement}
            <div
              class="settlement-card"
              class:selected={selectedSettlement?.id === settlement.id}
              on:click={() => selectSettlement(settlement)}
              on:keydown={(e) => e.key === 'Enter' && selectSettlement(settlement)}
              role="button"
              tabindex="0"
            >
              <div class="settlement-header">
                <span class="settlement-id">#{settlement.id?.slice(0, 8)}</span>
                <span class="status {getStatusClass(settlement.status)}">{settlement.status}</span>
              </div>
              <div class="settlement-parties">
                <span class="party">Party A: {settlement.intentHashA?.slice(0, 12)}...</span>
                <span class="party">Party B: {settlement.intentHashB?.slice(0, 12)}...</span>
              </div>
              <div class="settlement-meta">
                <span class="price">{settlement.proposedTerms?.price || '—'} NLC</span>
                <span class="date">{new Date(settlement.timestamp).toLocaleDateString()}</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      {#if selectedSettlement}
        <div class="settlement-detail">
          <h3>Settlement Details</h3>

          <div class="detail-section">
            <h4>Identifiers</h4>
            <div class="detail-row">
              <span class="label">Settlement ID</span>
              <span class="value mono">{selectedSettlement.id}</span>
            </div>
            <div class="detail-row">
              <span class="label">Mediator ID</span>
              <span class="value mono">{selectedSettlement.mediatorId}</span>
            </div>
          </div>

          <div class="detail-section">
            <h4>Intents</h4>
            <div class="detail-row">
              <span class="label">Intent A</span>
              <span class="value mono">{selectedSettlement.intentHashA}</span>
            </div>
            <div class="detail-row">
              <span class="label">Intent B</span>
              <span class="value mono">{selectedSettlement.intentHashB}</span>
            </div>
          </div>

          <div class="detail-section">
            <Tooltip text={ncipDefinitions.proposedTerms.text} ncipRef={ncipDefinitions.proposedTerms.ncipRef} position="left">
              <h4>Proposed Terms</h4>
            </Tooltip>
            {#if selectedSettlement.proposedTerms}
              <div class="detail-row">
                <span class="label">Price</span>
                <span class="value">{selectedSettlement.proposedTerms.price || '—'} NLC</span>
              </div>
              {#if selectedSettlement.proposedTerms.deliverables?.length}
                <div class="detail-row">
                  <span class="label">Deliverables</span>
                  <ul class="deliverables">
                    {#each selectedSettlement.proposedTerms.deliverables as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if selectedSettlement.proposedTerms.timelines}
                <div class="detail-row">
                  <span class="label">Timeline</span>
                  <span class="value">{selectedSettlement.proposedTerms.timelines}</span>
                </div>
              {/if}
            {/if}
          </div>

          <div class="detail-section">
            <Tooltip text={ncipDefinitions.reasoningTrace.text} ncipRef={ncipDefinitions.reasoningTrace.ncipRef} position="left">
              <h4>Reasoning Trace</h4>
            </Tooltip>
            <p class="reasoning">{selectedSettlement.reasoningTrace || 'No reasoning trace available'}</p>
          </div>

          <div class="detail-section">
            <h4>Fees & Status</h4>
            <div class="detail-row">
              <span class="label">Facilitation Fee</span>
              <span class="value">{selectedSettlement.facilitationFee} NLC ({selectedSettlement.facilitationFeePercent}%)</span>
            </div>
            <div class="detail-row">
              <span class="label">Party A Accepted</span>
              <span class="value">{selectedSettlement.partyAAccepted ? '✅ Yes' : '⏳ Pending'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Party B Accepted</span>
              <span class="value">{selectedSettlement.partyBAccepted ? '✅ Yes' : '⏳ Pending'}</span>
            </div>
            <div class="detail-row">
              <Tooltip text={ncipDefinitions.acceptanceDeadline.text} ncipRef="MP-01" position="left">
                <span class="label">Acceptance Deadline</span>
              </Tooltip>
              <span class="value">{new Date(selectedSettlement.acceptanceDeadline).toLocaleString()}</span>
            </div>
          </div>

          {#if selectedSettlement.requiresVerification}
            <div class="detail-section verification">
              <Tooltip text={ncipDefinitions.semanticVerification.text} ncipRef={ncipDefinitions.semanticVerification.ncipRef} position="left">
                <h4>Semantic Verification</h4>
              </Tooltip>
              <div class="detail-row">
                <span class="label">Status</span>
                <span class="value">{selectedSettlement.verificationStatus || 'pending'}</span>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .settlements {
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  }

  h2 {
    font-size: 1.5rem;
    color: #e4e4e7;
  }

  .tabs {
    display: flex;
    gap: 8px;
  }

  .tabs button {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #a1a1aa;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tabs button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .tabs button.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: transparent;
    color: white;
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
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  .settlements-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .settlement-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .settlement-card:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .settlement-card.selected {
    border-color: #667eea;
    background: rgba(102, 126, 234, 0.1);
  }

  .settlement-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .settlement-id {
    font-family: monospace;
    color: #667eea;
    font-weight: 600;
  }

  .status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-pending { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .status-success { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
  .status-error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
  .status-warning { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .status-closed { background: rgba(113, 113, 122, 0.2); color: #71717a; }

  .settlement-parties {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .party {
    font-size: 0.875rem;
    color: #a1a1aa;
    font-family: monospace;
  }

  .settlement-meta {
    display: flex;
    justify-content: space-between;
  }

  .price {
    color: #22c55e;
    font-weight: 600;
  }

  .date {
    color: #71717a;
    font-size: 0.875rem;
  }

  .settlement-detail {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .settlement-detail h3 {
    margin-bottom: 20px;
    color: #e4e4e7;
  }

  .detail-section {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .detail-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .detail-section h4 {
    color: #a1a1aa;
    font-size: 0.875rem;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    gap: 16px;
  }

  .label {
    color: #71717a;
  }

  .value {
    color: #e4e4e7;
    text-align: right;
    word-break: break-all;
  }

  .value.mono {
    font-family: monospace;
    font-size: 0.875rem;
  }

  .deliverables {
    list-style: disc;
    padding-left: 20px;
    color: #e4e4e7;
  }

  .reasoning {
    color: #a1a1aa;
    font-size: 0.875rem;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .verification {
    background: rgba(102, 126, 234, 0.1);
    border-radius: 8px;
    padding: 16px;
    margin: 0 -8px;
  }

  @media (max-width: 900px) {
    .content-wrapper {
      grid-template-columns: 1fr;
    }
  }
</style>
