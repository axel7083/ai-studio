<script lang="ts">
  import { type InstructlabSession, InstructLabState } from '@shared/src/models/instructlab/IInstructlabSession';

export let object: InstructlabSession;

function getStatusLabel(state: InstructLabState): string {
  switch (state) {
    case InstructLabState.INITIALIZED:
      return 'Initialized';
    case InstructLabState.SETUP_GENERATE:
      return 'Setup generate';
    case InstructLabState.GENERATING:
      return 'Generating';
    case InstructLabState.GENERATING_COMPLETED:
      return 'Generate completed';
    case InstructLabState.SETUP_FINE_TUNE:
      return 'Setup fine tune';
    case InstructLabState.FINE_TUNING:
      return 'Fine Tuning';
    case InstructLabState.TRAINING_COMPLETED:
      return 'Training completed';
    default:
      return 'unknown';
  }
}
</script>

<div class="text-[var(--pd-table-body-text)] whitespace-normal break-normal">
  {getStatusLabel(object.state)}
</div>
