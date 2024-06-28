<script lang="ts">
import moment from 'moment';
import { humanizeAge } from '/@/utils/dimensions';
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';

export let object: ApplicationInfo;
</script>

<div class="text-sm text-[var(--pd-table-body-text)] overflow-hidden text-ellipsis">
  <!-- humanizeAge(moment(object.pod.Created).unix()) -->
  N/A
</div>
