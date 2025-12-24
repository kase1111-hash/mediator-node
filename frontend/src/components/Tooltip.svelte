<script>
  export let text = '';
  export let ncipRef = null;
  export let position = 'top';

  let showTooltip = false;
</script>

<div
  class="tooltip-wrapper"
  on:mouseenter={() => showTooltip = true}
  on:mouseleave={() => showTooltip = false}
  role="tooltip"
>
  <slot />
  {#if showTooltip && text}
    <div class="tooltip tooltip-{position}">
      <p>{text}</p>
      {#if ncipRef}
        <span class="ncip-ref">{ncipRef}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    position: absolute;
    z-index: 1000;
    background: rgba(30, 30, 46, 0.98);
    border: 1px solid rgba(102, 126, 234, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    max-width: 300px;
    min-width: 200px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    font-size: 0.875rem;
    line-height: 1.5;
    color: #e4e4e7;
    pointer-events: none;
  }

  .tooltip-top {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
  }

  .tooltip-bottom {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 8px;
  }

  .tooltip-left {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 8px;
  }

  .tooltip-right {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 8px;
  }

  .tooltip p {
    margin: 0;
  }

  .ncip-ref {
    display: inline-block;
    margin-top: 8px;
    padding: 2px 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
  }
</style>
