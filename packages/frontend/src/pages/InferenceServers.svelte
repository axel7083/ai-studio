<script lang="ts">
import { Column, Row } from '/@/lib/table/table';
import type { InferenceServer } from '@shared/src/models/IInference';
import ServiceColumnName from '/@/lib/table/service/ServiceColumnName.svelte';
import NavPage from '/@/lib/NavPage.svelte';
import Table from '/@/lib/table/Table.svelte';
import { inferenceServers } from '/@/stores/inferenceServers';
import ServiceColumnStatus from '/@/lib/table/service/ServiceColumnStatus.svelte';

const columns: Column<InferenceServer>[] = [
  new Column<InferenceServer>('Status', { width: '50px', renderer: ServiceColumnStatus }),
  new Column<InferenceServer>('Name', { width: '3fr', renderer: ServiceColumnName, align: 'center' }),
];
const row = new Row<InferenceServer>({});
</script>

<NavPage title="Services" searchEnabled="{false}">
  <svelte:fragment slot="content">
    <div slot="content" class="flex flex-col min-w-full min-h-full">
      <div class="min-w-full min-h-full flex-1">
        <div class="mt-4 px-5 space-y-5 h-full">
          <Table kind="service" data="{$inferenceServers}" columns="{columns}" row="{row}"></Table>
        </div>
      </div>
    </div>
  </svelte:fragment>
</NavPage>
