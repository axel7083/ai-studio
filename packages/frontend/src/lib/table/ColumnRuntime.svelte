<script lang="ts">
import { RuntimeType } from '@shared/src/models/IInference';
export let object: RuntimeType;

function getProviderColour(object: RuntimeType): string {
  switch (object) {
    case RuntimeType.PODMAN:
      return 'bg-purple-600';
    case RuntimeType.KUBERNETES:
      return 'bg-sky-600';
    default:
      return 'bg-gray-900';
  }
}
</script>

<div
  class="flex items-center bg-[var(--pd-label-bg)] p-1 rounded-md text-xs text-[var(--pd-label-text)] gap-x-1 capitalize">
  <div class="w-2 h-2 {getProviderColour(object)} rounded-full"></div>
  {object}
</div>
