<script lang="ts">
import { faGaugeHigh, faPlusCircle } from '@fortawesome/free-solid-svg-icons';
import {
  Button,
  EmptyScreen,
  NavPage,
  Tab,
  Table,
  TableColumn,
  TableRow,
  TableDurationColumn,
} from '@podman-desktop/ui-svelte';
import { onMount } from 'svelte';
import { instructlabSessions } from '../stores/instructlabSessions';
import { type InstructlabSession, InstructLabState } from '@shared/src/models/instructlab/IInstructlabSession';
import InstructlabColumnName from '../lib/table/instructlab/InstructlabColumnName.svelte';
import InstructlabColumnModelName from '../lib/table/instructlab/InstructlabColumnModelName.svelte';
import InstructlabColumnRepository from '../lib/table/instructlab/InstructlabColumnRepository.svelte';
import InstructlabColumnStatus from '../lib/table/instructlab/InstructlabColumnStatus.svelte';
import { router } from 'tinro';
import Route from '../Route.svelte';
import InstructlabStatusIcon from '/@/lib/table/instructlab/InstructlabStatusIcon.svelte';
import SessionAction from '/@/lib/table/instructlab/SessionAction.svelte';

function start(): void {
  router.goto('/tune/start');
}

const columns = [
  // status icon
  new TableColumn<InstructlabSession>('Status', { width: '60px', renderer: InstructlabStatusIcon, align: 'left' }),
  // state (initialized, generating, fine-tuning, completed)
  new TableColumn<InstructlabSession>('Stage', { width: '70px', renderer: InstructlabColumnStatus, align: 'left' }),
  // session name
  new TableColumn<InstructlabSession>('Name', { width: '100px', renderer: InstructlabColumnName, align: 'left' }),
  // target model
  new TableColumn<InstructlabSession>('Teacher Model', {
    width: '1fr',
    renderer: InstructlabColumnModelName,
    align: 'left',
  }),
  // repository used
  new TableColumn<InstructlabSession>('Repository', {
    width: '1fr',
    renderer: InstructlabColumnRepository,
    align: 'left',
  }),
  // session age
  new TableColumn<InstructlabSession, Date | undefined>('Age', {
    width: '70px',
    renderer: TableDurationColumn,
    renderMapping: (session): Date => new Date(session.createdTime),
  }),
  // actions
  new TableColumn<InstructlabSession>('Actions', {
    width: '100px',
    renderer: SessionAction,
    align: 'right',
  }),
];
const row = new TableRow<InstructlabSession>({});

let data: InstructlabSession[] = $state([]);

let running = $derived(data.filter(t => t.state !== InstructLabState.TRAINING_COMPLETED));
let completed = $derived(data.filter(t => t.state === InstructLabState.TRAINING_COMPLETED));

onMount(() => {
  return instructlabSessions.subscribe(items => {
    data = items;
  });
});
</script>

<NavPage title="InstructLab Sessions" searchEnabled={false}>
  <svelte:fragment slot="tabs">
    <Tab title="All" url="/tune" selected={$router.path === '/tune'} />
    <Tab title="Running" url="/tune/running" selected={$router.path === '/tune/running'} />
    <Tab title="Completed" url="/tune/completed" selected={$router.path === '/tune/completed'} />
  </svelte:fragment>
  <svelte:fragment slot="additional-actions">
    <Button icon={faPlusCircle} on:click={start}>Start Fine Tuning</Button>
  </svelte:fragment>
  <svelte:fragment slot="content">
    <div class="flex min-w-full">
      <!-- All models -->
      <Route path="/">
        {#if data?.length > 0}
          <Table kind="session" data={data} columns={columns} row={row} />
        {:else}
          <EmptyScreen
            aria-label="status"
            icon={faGaugeHigh}
            title="No InstructLab Session"
            message="Create InstructLab session to improve trained models with specialized knowledges and skills tuning">
            <div class="flex gap-2 justify-center">
              <Button type="link" on:click={start}>Create InstructLab Session</Button>
            </div>
          </EmptyScreen>
        {/if}
      </Route>

      <!-- Running models -->
      <Route path="/running">
        {#if running?.length > 0}
          <Table kind="session" data={running} columns={columns} row={row} />
        {:else}
          <EmptyScreen
            aria-label="status"
            icon={faGaugeHigh}
            title="No Running InstructLab Session"
            message="Create InstructLab session to improve trained models with specialized knowledges and skills tuning">
            <div class="flex gap-2 justify-center">
              <Button type="link" on:click={start}>Create InstructLab Session</Button>
            </div>
          </EmptyScreen>
        {/if}
      </Route>

      <!-- Completed models -->
      <Route path="/completed">
        {#if completed?.length > 0}
          <Table kind="session" data={completed} columns={columns} row={row} />
        {:else}
          <EmptyScreen
            aria-label="status"
            icon={faGaugeHigh}
            title="No Completed InstructLab Session"
            message="Create InstructLab session to improve trained models with specialized knowledges and skills tuning">
            <div class="flex gap-2 justify-center">
              <Button type="link" on:click={start}>Create InstructLab Session</Button>
            </div>
          </EmptyScreen>
        {/if}
      </Route>
    </div>
  </svelte:fragment>
</NavPage>
