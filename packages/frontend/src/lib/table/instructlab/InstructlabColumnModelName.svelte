<script lang="ts">
import type { InstructlabSession } from '@shared/src/models/instructlab/IInstructlabSession';
import { router } from 'tinro';
import { catalog } from '/@/stores/catalog';

export let object: InstructlabSession;

let modelName: string | undefined;
$: modelName = $catalog.models.find(r => r.id === object.teacherModelId)?.name;

function openDetails(): void {
  router.goto(`/model/${object.teacherModelId}`);
}
</script>

<button title="Open model details" class="text-[var(--pd-table-body-text-highlight)]" on:click={openDetails}>
  {modelName}
</button>
