<script lang="ts">
import { inferenceServers } from '/@/stores/inferenceServers';
import NavPage from '/@/lib/NavPage.svelte';

export let containerId: string | undefined = undefined;

$: service = $inferenceServers.find(server => server.container.containerId === containerId);
</script>

<NavPage title="Service Details" searchEnabled="{false}">
  <svelte:fragment slot="content">
    <span>{service?.status}</span>
  </svelte:fragment>
</NavPage>
