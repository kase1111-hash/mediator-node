<script>
  import { onMount } from 'svelte';
  import Navigation from './components/Navigation.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Settlements from './components/Settlements.svelte';
  import Intents from './components/Intents.svelte';
  import Reputation from './components/Reputation.svelte';
  import Disputes from './components/Disputes.svelte';
  import Configuration from './components/Configuration.svelte';

  let currentView = 'dashboard';
  let connectionStatus = 'connecting';

  function handleNavigate(event) {
    currentView = event.detail.view;
  }

  onMount(() => {
    // Check connection to mediator node
    checkConnection();
  });

  async function checkConnection() {
    try {
      const response = await fetch('/api/v1/health');
      if (response.ok) {
        connectionStatus = 'connected';
      } else {
        connectionStatus = 'error';
      }
    } catch (e) {
      connectionStatus = 'disconnected';
    }
  }
</script>

<main>
  <header>
    <h1>Mediator Node</h1>
    <p class="tagline">NatLangChain Settlement Facilitator</p>
    <div class="connection-status" class:connected={connectionStatus === 'connected'} class:error={connectionStatus === 'error'}>
      <span class="status-dot"></span>
      <span class="status-text">
        {#if connectionStatus === 'connected'}
          Connected
        {:else if connectionStatus === 'connecting'}
          Connecting...
        {:else if connectionStatus === 'error'}
          Connection Error
        {:else}
          Disconnected
        {/if}
      </span>
    </div>
  </header>

  <Navigation {currentView} on:navigate={handleNavigate} />

  <div class="content">
    {#if currentView === 'dashboard'}
      <Dashboard />
    {:else if currentView === 'settlements'}
      <Settlements />
    {:else if currentView === 'intents'}
      <Intents />
    {:else if currentView === 'reputation'}
      <Reputation />
    {:else if currentView === 'disputes'}
      <Disputes />
    {:else if currentView === 'config'}
      <Configuration />
    {/if}
  </div>

  <footer>
    <p>Mediator Node - Powered by NatLangChain Protocol</p>
  </footer>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    min-height: 100vh;
    color: #e4e4e7;
  }

  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    text-align: center;
    padding: 30px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 20px;
    position: relative;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 8px;
  }

  .tagline {
    color: #a1a1aa;
    font-size: 1rem;
  }

  .connection-status {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 20px;
    font-size: 0.875rem;
    color: #a1a1aa;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f59e0b;
    animation: pulse 2s infinite;
  }

  .connection-status.connected .status-dot {
    background: #22c55e;
    animation: none;
  }

  .connection-status.error .status-dot {
    background: #ef4444;
    animation: none;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .content {
    flex: 1;
    padding: 20px 0;
  }

  footer {
    text-align: center;
    padding: 20px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin-top: 20px;
    color: #71717a;
    font-size: 0.875rem;
  }
</style>
