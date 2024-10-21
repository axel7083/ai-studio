<script lang="ts">
import ModelWhite from '../../icons/ModelWhite.svelte';

import { StatusIcon, Spinner } from '@podman-desktop/ui-svelte';
import { type InstructlabSession, InstructLabState } from '@shared/src/models/instructlab/IInstructlabSession';

export let object: InstructlabSession;

let status: string | undefined;

$: status = getStatus();

function getStatus(): string {
  switch (object.state) {
    case InstructLabState.INITIALIZED:
      return 'CREATED';
    case InstructLabState.SETUP_GENERATE:
    case InstructLabState.SETUP_FINE_TUNE:
      return 'STARTING';
    case InstructLabState.GENERATING:
    case InstructLabState.FINE_TUNING:
      return 'RUNNING';
    default:
      return 'NONE';
  }
}
</script>

{#if status === 'STARTING'}
  <Spinner class="text-[var(--pd-table-body-text-highlight)]" />
{:else}
  <StatusIcon status={status} icon={ModelWhite} />
{/if}


