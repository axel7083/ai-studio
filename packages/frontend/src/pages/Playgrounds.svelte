<script lang="ts">
import { router } from 'tinro';
import PlaygroundColumnModel from '../lib/table/playground/PlaygroundColumnModel.svelte';
import PlaygroundColumnName from '../lib/table/playground/PlaygroundColumnName.svelte';
import ConversationColumnAction from '/@/lib/table/playground/ConversationColumnAction.svelte';
import { conversations, type ConversationWithBackend } from '/@/stores/conversations';
import PlaygroundColumnIcon from '/@/lib/table/playground/PlaygroundColumnIcon.svelte';
import { Button, EmptyScreen, Table, TableColumn, TableRow, NavPage } from '@podman-desktop/ui-svelte';
import { faMessage, faPlusCircle } from '@fortawesome/free-solid-svg-icons';
import PlaygroundColumnRuntime from '../lib/table/playground/PlaygroundColumnRuntime.svelte';

const columns = [
  new TableColumn<unknown>('', { width: '40px', renderer: PlaygroundColumnIcon }),
  new TableColumn<ConversationWithBackend>('Name', { width: '1fr', renderer: PlaygroundColumnName }),
  new TableColumn<ConversationWithBackend>('Model', { width: '1fr', renderer: PlaygroundColumnModel }),
  new TableColumn<ConversationWithBackend>('Runtime', { width: '90px', renderer: PlaygroundColumnRuntime }),
  new TableColumn<ConversationWithBackend>('Actions', {
    width: '80px',
    renderer: ConversationColumnAction,
    align: 'right',
  }),
];
const row = new TableRow<ConversationWithBackend>({});

function createNewPlayground(): void {
  router.goto('/playground/create');
}
</script>

<NavPage title="Playground Environments" searchEnabled={false}>
  <svelte:fragment slot="additional-actions">
    <Button icon={faPlusCircle} on:click={createNewPlayground}>New Playground</Button>
  </svelte:fragment>
  <svelte:fragment slot="content">
    <div class="flex min-w-full">
      {#if $conversations.length > 0}
        <Table kind="playground" data={$conversations} columns={columns} row={row}></Table>
      {:else}
        <EmptyScreen
          icon={faMessage}
          title="No Playground Environment"
          message="Playground environments allow for experimenting with available models in a local environment. An intuitive user prompt helps in exploring the capabilities and accuracy of various models and aids in finding the best model for the use case at hand.">
          <div class="flex gap-2 justify-center">
            <Button type="link" on:click={createNewPlayground}>Create playground</Button>
          </div>
        </EmptyScreen>
      {/if}
    </div>
  </svelte:fragment>
</NavPage>
