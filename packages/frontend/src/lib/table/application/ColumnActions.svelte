<script lang="ts">
import ApplicationActions from '../../ApplicationActions.svelte';
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';
export let object: ApplicationInfo;
</script>

<ApplicationActions
  recipeId="{object.recipeId}"
  modelId="{object.modelId}"
  object="{object}"
  dropdownMenu="{true}"
  enableGoToRecipeAction="{true}" />
