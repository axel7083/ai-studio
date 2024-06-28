<script lang="ts">
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';

export let object: ApplicationInfo | undefined;
</script>

{#if object}
  <span>N/A</span>
{/if}
