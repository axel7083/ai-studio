<script lang="ts">
import { inferenceServers } from '/@/stores/inferenceServers';
import NavPage from '/@/lib/NavPage.svelte';
import ServiceStatus from '/@/lib/table/service/ServiceStatus.svelte';
import ServiceAction from '/@/lib/table/service/ServiceAction.svelte';
import Fa from 'svelte-fa';
import { faCopy, faMicrochip } from '@fortawesome/free-solid-svg-icons';

export let containerId: string | undefined = undefined;

$: service = $inferenceServers.find(server => server.container.containerId === containerId);

const copyAddress = () => {
  alert('not implemented');
}

const copyCodeSnippet = () => {
  alert('not implemented');
}
</script>
<NavPage title="Service Details" searchEnabled="{false}">
  <svelte:fragment slot="content">
    <div slot="content" class="flex flex-col min-w-full min-h-full">
      <div class="min-w-full min-h-full flex-1">
        <div class="mt-4 px-5 space-y-5 h-full">
          {#if service !== undefined}
            <!-- container details -->
            <div class="bg-charcoal-800 rounded-md w-full p-4">
              <!-- container info -->
              <span class="text-base">Container</span>
              <div class="w-full bg-charcoal-600 rounded-md p-2 flex items-center">
                <div class="grow ml-2 flex flex-row">
                  <ServiceStatus object={service} />
                  <div class="flex flex-col text-xs ml-2">
                    <span>{service.container.containerId}</span>
                  </div>
                </div>
                <ServiceAction object={service} />
              </div>

              <!-- models info -->
              <span class="text-base mt-2">Models</span>
              <div class="w-full bg-charcoal-600 rounded-md p-2">
                <ul>
                  {#each service.models as model}
                    <li>{model.name}</li>
                  {/each}
                </ul>
              </div>
            </div>

            <!-- server details -->
            <div class="bg-charcoal-800 rounded-md w-full p-4 mt-2">
              <span class="text-base">Server</span>
              <div class="flex flex-row gap-4">
                <div class="bg-charcoal-600 rounded-md p-2 flex flex-row w-min h-min text-nowrap items-center" >
                  http://localhost:{service.connection.port}/v1
                  <button title="copy" class="ml-2" on:click={copyAddress}>
                    <Fa icon="{faCopy}" />
                  </button>
                </div>

                <div class="bg-charcoal-600 rounded-md p-2 flex flex-row w-min h-min text-nowrap items-center" >
                  CPU Inference
                  <Fa class="ml-2" icon="{faMicrochip}" />
                </div>
              </div>
            </div>

            <!-- code client -->
            <div class="flex flex-row">
              <span class="text-base grow">Client code</span>
              <button title="copy" class="ml-2" on:click={copyCodeSnippet}>
                <Fa icon="{faCopy}" />
              </button>
            </div>

            <div class="bg-charcoal-900 rounded-md w-full p-4 mt-2">

            </div>

          {/if}
        </div>
      </div>
    </div>
  </svelte:fragment>
</NavPage>
