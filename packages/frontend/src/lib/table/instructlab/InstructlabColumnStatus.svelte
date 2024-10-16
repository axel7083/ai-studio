<script lang="ts">
import type { InstructlabSession, InstructlabSessionState } from '@shared/src/models/instructlab/IInstructlabSession';

export let object: InstructlabSession;

function getStatusLabel(code: InstructlabSessionState): string {
  switch (code) {
    case 'fine-tuned':
      return 'Fine tuned';
    case 'generating-instructions':
      return 'Generating Instructions';
  }
}
</script>

<div class="text-[var(--pd-table-body-text)] whitespace-normal break-normal">
  {getStatusLabel(object.state)}
</div>
