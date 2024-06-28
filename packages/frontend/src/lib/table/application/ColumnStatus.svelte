<script lang="ts">
import { getApplicationStatus } from '../../../pages/applications';
import StatusIcon from '../../StatusIcon.svelte';
import PodIcon from '../../images/PodIcon.svelte';
import { Spinner } from '@podman-desktop/ui-svelte';
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';
export let object: ApplicationInfo;

$: status = getApplicationStatus(object);
</script>

{#if status === 'STARTING'}
  <Spinner />
{:else}
  <StatusIcon size="{22}" status="{status}" icon="{PodIcon}" />
{/if}
