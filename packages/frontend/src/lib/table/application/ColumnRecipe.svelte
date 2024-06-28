<script lang="ts">
import { catalog } from '/@/stores/catalog';
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';
import { studioClient } from '/@/utils/client';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import Fa from 'svelte-fa';

export let object: ApplicationInfo;

let name: string | undefined;
$: name = $catalog.recipes.find(r => r.id === object.recipeId)?.name;

let port: number | undefined = (object.appPorts && object.appPorts.length === 1)?object.appPorts[0]:undefined;
</script>

<div class="flex flex-col">
  <div class="text-sm text-[var(--pd-table-body-text-highlight)] overflow-hidden text-ellipsis">
    {name}
  </div>
  <div class="text-sm text-[var(--pd-table-body-text)] overflow-hidden text-ellipsis">
    <button
      on:click="{() =>
                        port &&
                        studioClient.openURL(`http://127.0.0.1:${port}`)}"
      class="bg-charcoal-600 rounded-md p-2 flex flex-row w-min h-min text-xs text-nowrap items-center underline">
      http://127.0.0.1:{port}
      <Fa class="ml-2" icon="{faArrowUpRightFromSquare}" />
    </button>
  </div>
</div>
