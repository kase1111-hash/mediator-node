<script>
  import { onMount } from 'svelte';
  import { getActiveDisputes, getChallenges } from '../lib/api.js';
  import Tooltip from './Tooltip.svelte';
  import { ncipDefinitions } from '../lib/ncip-definitions.js';

  let disputes = [];
  let challenges = [];
  let loading = true;
  let error = null;
  let selectedTab = 'disputes';
  let selectedItem = null;

  onMount(async () => {
    await loadDisputes();
  });

  async function loadDisputes() {
    loading = true;
    error = null;
    try {
      const [disputesData, challengesData] = await Promise.all([
        getActiveDisputes().catch(() => ({ disputes: [] })),
        getChallenges().catch(() => ({ challenges: [] })),
      ]);
      disputes = disputesData?.disputes || [];
      challenges = challengesData?.challenges || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case 'initiated':
      case 'pending': return 'status-pending';
      case 'under_review':
      case 'clarifying': return 'status-review';
      case 'escalated': return 'status-warning';
      case 'resolved':
      case 'upheld': return 'status-success';
      case 'dismissed':
      case 'rejected': return 'status-error';
      default: return '';
    }
  }

  $: currentItems = selectedTab === 'disputes' ? disputes : challenges;
</script>

<div class="disputes">
  <div class="header">
    <h2>Disputes & Challenges</h2>
    <div class="tabs">
      <button class:active={selectedTab === 'disputes'} on:click={() => { selectedTab = 'disputes'; selectedItem = null; }}>
        Disputes ({disputes.length})
      </button>
      <button class:active={selectedTab === 'challenges'} on:click={() => { selectedTab = 'challenges'; selectedItem = null; }}>
        Challenges ({challenges.length})
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading disputes...</div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button on:click={loadDisputes}>Retry</button>
    </div>
  {:else}
    <div class="info-banner">
      <Tooltip text={ncipDefinitions.dispute.text} ncipRef="NCIP-005" position="bottom">
        <p>
          {#if selectedTab === 'disputes'}
            <strong>Disputes</strong> are formal declarations of misinterpretation or violation. They can escalate to external authorities.
          {:else}
            <strong>Challenges</strong> are objections to specific settlements. Upheld challenges affect mediator reputation.
          {/if}
        </p>
      </Tooltip>
    </div>

    <div class="content-wrapper">
      <div class="items-list">
        {#if currentItems.length === 0}
          <div class="empty">
            <p>No active {selectedTab}</p>
          </div>
        {:else}
          {#each currentItems as item}
            <div
              class="item-card"
              class:selected={selectedItem?.id === item.id || selectedItem?.disputeId === item.disputeId}
              on:click={() => selectedItem = selectedItem?.id === item.id ? null : item}
              on:keydown={(e) => e.key === 'Enter' && (selectedItem = selectedItem?.id === item.id ? null : item)}
              role="button"
              tabindex="0"
            >
              <div class="item-header">
                <span class="item-id">#{(item.id || item.disputeId)?.slice(0, 8)}</span>
                <span class="status {getStatusClass(item.status)}">{item.status}</span>
              </div>

              {#if selectedTab === 'disputes'}
                <p class="item-description">{item.issueDescription?.slice(0, 100) || 'No description'}...</p>
                <div class="item-meta">
                  <span>Claimant: {item.claimant?.partyId?.slice(0, 12) || '—'}...</span>
                  <span>{new Date(item.initiatedAt).toLocaleDateString()}</span>
                </div>
              {:else}
                <p class="item-description">{item.contradictionProof?.slice(0, 100) || 'No proof provided'}...</p>
                <div class="item-meta">
                  <span>Settlement: {item.settlementId?.slice(0, 12) || '—'}...</span>
                  <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <div class="detail-panel">
        {#if selectedItem}
          <h3>{selectedTab === 'disputes' ? 'Dispute' : 'Challenge'} Details</h3>

          {#if selectedTab === 'disputes'}
            <div class="detail-section">
              <h4>Dispute Information</h4>
              <div class="detail-row">
                <span class="label">Dispute ID</span>
                <span class="value mono">{selectedItem.disputeId}</span>
              </div>
              <div class="detail-row">
                <span class="label">Status</span>
                <span class="value status {getStatusClass(selectedItem.status)}">{selectedItem.status}</span>
              </div>
              <div class="detail-row">
                <span class="label">Initiated</span>
                <span class="value">{new Date(selectedItem.initiatedAt).toLocaleString()}</span>
              </div>
            </div>

            <div class="detail-section">
              <h4>Parties</h4>
              <div class="detail-row">
                <span class="label">Claimant</span>
                <span class="value mono">{selectedItem.claimant?.partyId || '—'}</span>
              </div>
              {#if selectedItem.respondent}
                <div class="detail-row">
                  <span class="label">Respondent</span>
                  <span class="value mono">{selectedItem.respondent.partyId}</span>
                </div>
              {/if}
            </div>

            <div class="detail-section">
              <Tooltip text={ncipDefinitions.dispute.text} ncipRef="NCIP-005" position="left">
                <h4>Issue Description</h4>
              </Tooltip>
              <p class="description">{selectedItem.issueDescription || 'No description provided'}</p>
            </div>

            {#if selectedItem.contestedItems?.length}
              <div class="detail-section">
                <h4>Contested Items</h4>
                <div class="contested-list">
                  {#each selectedItem.contestedItems as item}
                    <div class="contested-item">
                      <span class="contested-type">{item.itemType}</span>
                      <span class="contested-id">{item.itemId?.slice(0, 16)}...</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedItem.clarificationRecord}
              <div class="detail-section">
                <Tooltip text={ncipDefinitions.clarificationPhase.text} ncipRef="MP-03" position="left">
                  <h4>Clarification Phase</h4>
                </Tooltip>
                <div class="detail-row">
                  <span class="label">Mediator</span>
                  <span class="value mono">{selectedItem.clarificationRecord.mediatorId}</span>
                </div>
                {#if selectedItem.clarificationRecord.factualDisagreements?.length}
                  <div class="disagreements">
                    <span class="label">Factual Disagreements:</span>
                    <ul>
                      {#each selectedItem.clarificationRecord.factualDisagreements as d}
                        <li>{d}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/if}

            {#if selectedItem.escalation}
              <div class="detail-section escalation">
                <Tooltip text={ncipDefinitions.escalation.text} ncipRef="NCIP-012" position="left">
                  <h4>Escalation</h4>
                </Tooltip>
                <div class="detail-row">
                  <span class="label">Authority</span>
                  <span class="value">{selectedItem.escalation.targetAuthority?.name || '—'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Type</span>
                  <span class="value">{selectedItem.escalation.targetAuthority?.authorityType || '—'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Escalated At</span>
                  <span class="value">{new Date(selectedItem.escalation.escalatedAt).toLocaleString()}</span>
                </div>
              </div>
            {/if}

          {:else}
            <div class="detail-section">
              <h4>Challenge Information</h4>
              <div class="detail-row">
                <span class="label">Challenge ID</span>
                <span class="value mono">{selectedItem.id}</span>
              </div>
              <div class="detail-row">
                <span class="label">Settlement ID</span>
                <span class="value mono">{selectedItem.settlementId}</span>
              </div>
              <div class="detail-row">
                <span class="label">Status</span>
                <span class="value status {getStatusClass(selectedItem.status)}">{selectedItem.status}</span>
              </div>
              <div class="detail-row">
                <span class="label">Challenger</span>
                <span class="value mono">{selectedItem.challengerId}</span>
              </div>
            </div>

            <div class="detail-section">
              <h4>Contradiction Proof</h4>
              <p class="description">{selectedItem.contradictionProof || 'No proof provided'}</p>
            </div>

            <div class="detail-section">
              <h4>Paraphrase Evidence</h4>
              <p class="description">{selectedItem.paraphraseEvidence || 'No evidence provided'}</p>
            </div>

            {#if selectedItem.validators?.length}
              <div class="detail-section">
                <h4>Validators</h4>
                <div class="validators-list">
                  {#each selectedItem.validators as validator}
                    <span class="validator">{validator.slice(0, 12)}...</span>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        {:else}
          <div class="no-selection">
            <p>Select a {selectedTab === 'disputes' ? 'dispute' : 'challenge'} to view details</p>
          </div>
        {/if}
      </div>
    </div>

    <div class="cooling-info">
      <Tooltip text={ncipDefinitions.coolingPeriod.text} ncipRef="NCIP-012" position="top">
        <h4>Cooling Periods (NCIP-012)</h4>
      </Tooltip>
      <div class="cooling-grid">
        <div class="cooling-item">
          <span class="cooling-type">Agreement Finalization</span>
          <span class="cooling-duration">12 hours</span>
        </div>
        <div class="cooling-item">
          <span class="cooling-type">Settlement > Threshold</span>
          <span class="cooling-duration">24 hours</span>
        </div>
        <div class="cooling-item">
          <span class="cooling-type">License Delegation</span>
          <span class="cooling-duration">24 hours</span>
        </div>
        <div class="cooling-item">
          <span class="cooling-type">Dispute Escalation</span>
          <span class="cooling-duration">6 hours</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .disputes {
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

  h3 {
    color: #e4e4e7;
    margin-bottom: 16px;
  }

  h4 {
    color: #a1a1aa;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
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

  .info-banner {
    background: rgba(102, 126, 234, 0.1);
    border: 1px solid rgba(102, 126, 234, 0.2);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .info-banner p {
    color: #a1a1aa;
  }

  .info-banner strong {
    color: #667eea;
  }

  .content-wrapper {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 60vh;
    overflow-y: auto;
  }

  .item-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .item-card:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .item-card.selected {
    border-color: #667eea;
    background: rgba(102, 126, 234, 0.1);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .item-id {
    font-family: monospace;
    color: #667eea;
    font-weight: 600;
  }

  .status {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-pending { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .status-review { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
  .status-warning { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .status-success { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
  .status-error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

  .item-description {
    color: #a1a1aa;
    font-size: 0.875rem;
    margin-bottom: 8px;
  }

  .item-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #71717a;
  }

  .detail-panel {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
    max-height: 60vh;
    overflow-y: auto;
  }

  .detail-section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .detail-section.escalation {
    background: rgba(245, 158, 11, 0.1);
    border-radius: 8px;
    padding: 16px;
    margin: 0 -8px;
    border: none;
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
  }

  .description {
    color: #a1a1aa;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .contested-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .contested-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
  }

  .contested-type {
    color: #a1a1aa;
    text-transform: capitalize;
  }

  .contested-id {
    font-family: monospace;
    color: #667eea;
    font-size: 0.875rem;
  }

  .disagreements ul {
    margin-top: 8px;
    padding-left: 20px;
    color: #a1a1aa;
  }

  .validators-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .validator {
    padding: 4px 8px;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.75rem;
    color: #667eea;
  }

  .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #71717a;
  }

  .cooling-info {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
  }

  .cooling-info h4 {
    margin-bottom: 16px;
  }

  .cooling-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .cooling-item {
    text-align: center;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
  }

  .cooling-type {
    display: block;
    color: #a1a1aa;
    font-size: 0.75rem;
    margin-bottom: 8px;
  }

  .cooling-duration {
    font-size: 1.25rem;
    font-weight: 700;
    color: #667eea;
  }

  @media (max-width: 900px) {
    .content-wrapper {
      grid-template-columns: 1fr;
    }

    .cooling-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
