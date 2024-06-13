<script lang="ts">
import { onMount } from 'svelte';

export let text: string;

let scrollWidth = 0;
let containerElement: HTMLElement;
let textElement: HTMLElement;
let observer: ResizeObserver = new ResizeObserver(() => {
  computeScrollWidth();
});

let init: boolean = false

function computeScrollWidth(): void {
  scrollWidth = textElement.scrollWidth - containerElement.clientWidth;
}
$: {
  if (textElement && containerElement) {
    computeScrollWidth();

    if(!init) {
      observer.observe(containerElement);
      init = true;
    }
  }
}

onMount(() => {
  // This callback cleans up the observer
  return () => observer.disconnect();
});
</script>

<style>
  .blue-btn a{
    color: white;
    text-decoration:none;
    text-align: center;
    display:inline-block; /* important */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .blue-btn{
    overflow: hidden;
  }

  .blue-btn a:hover{
    text-decoration: none;
  }

  .first-link{
    margin-left: 0em;
  }

  .blue-btn:hover .first-link{
    margin-left: var(--scroll-width);
    -webkit-transition: margin-left var(--scroll-speed) linear;
    -moz-transition: margin-left var(--scroll-speed) linear;
    transition: margin-left var(--scroll-speed) linear;
  }

  .blue-btn .first-link {
    -webkit-transition: none;
    -moz-transition: none;
    transition: none;
  }

</style>

<div
  class="blue-btn" bind:this={containerElement}>
  <div class="first-link" bind:this={textElement} style="--scroll-width: -{scrollWidth}px; --scroll-speed: {scrollWidth/125}s">
    {text}
  </div>
</div>
