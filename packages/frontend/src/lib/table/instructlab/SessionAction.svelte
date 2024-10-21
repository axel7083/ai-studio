<script lang="ts">
import { type InstructlabSession, InstructLabState } from '@shared/src/models/instructlab/IInstructlabSession';
import { faCancel, faFolderOpen, faForwardStep } from '@fortawesome/free-solid-svg-icons';
import ListItemButtonIcon from '/@/lib/button/ListItemButtonIcon.svelte';
import { instructlabClient } from '/@/utils/client';

export let object: InstructlabSession;

let loading: boolean = false;
$: loading;

function openSessionDirectory(): Promise<boolean> {
  return instructlabClient.openSessionDirectory(object.uid);
}

function requestStartGeneratingDatasets(): Promise<void> {
  loading = true;
  return instructlabClient.requestGenerateSession(object.uid).finally(() => {
    loading = false;
  });
}

function isCancellable(state: InstructLabState): boolean {
  switch (state) {
    case InstructLabState.INITIALIZED:
    case InstructLabState.GENERATING_COMPLETED:
    case InstructLabState.TRAINING_COMPLETED:
      return false;
    case InstructLabState.SETUP_GENERATE:
    case InstructLabState.GENERATING:
    case InstructLabState.SETUP_FINE_TUNE:
    case InstructLabState.FINE_TUNING:
      return true;
  }
}

function abortSession(): Promise<void> {
  loading = true;
  return instructlabClient.abortSession(object.uid).finally(() => {
    loading = false;
  });
}
</script>

<ListItemButtonIcon icon={faFolderOpen} onClick={openSessionDirectory} title="Open session directory" />
{#if object.state === InstructLabState.INITIALIZED}
  <ListItemButtonIcon enabled={!loading} icon={faForwardStep} onClick={requestStartGeneratingDatasets} title="Start generating dataset" />
{/if}

{#if isCancellable(object.state)}
  <ListItemButtonIcon enabled={!loading} icon={faCancel} onClick={abortSession} title="Abort session" />
{/if}


