<script lang="ts">
import { onMount } from 'svelte';
import * as swaggerJson from '../../openapi.json';
import SwaggerUI from 'swagger-ui';
import 'swagger-ui/dist/swagger-ui.css';
import '../assets/swagger-dark-ui.css';

onMount(async () => {
  SwaggerUI({
    spec: swaggerJson,
    dom_id: '#swagger-ui-container'
  });
});
</script>

<div class="overflow-y-scroll w-full" id="swagger-ui-container" />


