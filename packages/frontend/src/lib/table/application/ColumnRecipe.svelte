<script lang="ts">
import { catalog } from '/@/stores/catalog';
import { displayPorts } from '/@/utils/printers';
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';

export let object: ApplicationInfo;

let name: string | undefined;
$: name = $catalog.recipes.find(r => r.id === object.recipeId)?.name;
</script>

<div class="flex flex-col">
  <div class="text-sm text-[var(--pd-table-body-text-highlight)] overflow-hidden text-ellipsis">
    {name}
  </div>
  <div class="text-sm text-[var(--pd-table-body-text)] overflow-hidden text-ellipsis">
    {displayPorts(object.appPorts)}
  </div>
</div>
