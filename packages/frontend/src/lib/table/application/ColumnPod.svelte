<script lang="ts">
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';

export let object: ApplicationInfo;
</script>

<div class="text-sm text-[var(--pd-table-body-text)] overflow-hidden text-ellipsis">
  {object.id}
</div>
