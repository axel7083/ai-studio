<script lang="ts">
export let message: string | undefined = undefined;
export let title: string = 'Expand';
let showMessage: boolean = false;

function handleClick(): void {
  showMessage = !showMessage;
}
</script>

{#if message}
  <div role="note" class:hidden={!showMessage} class="my-2 break-words">{message}</div>
  <div class="flex flex-col w-full items-end">
    <button on:click={handleClick} class="text-[var(--pd-link)] text-xs">
      {title}
      {#if showMessage}
        <i class="fas fa-chevron-up"></i>
      {:else}
        <i class="fas fa-chevron-down"></i>
      {/if}
    </button>
  </div>
{/if}
