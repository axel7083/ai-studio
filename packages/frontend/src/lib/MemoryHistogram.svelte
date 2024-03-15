<script lang="ts">
  import { LineChart } from '@carbon/charts-svelte';
  import '@carbon/charts-svelte/styles.css';
  import { type BarChartOptions, type ChartTabularData, ScaleTypes } from '@carbon/charts';
  import { statsHistories } from '/@/stores/statsHistories';
  import { onMount } from 'svelte';

  export let containerId: string;

let data: ChartTabularData;
$: data = ($statsHistories.find(history => history.containerId === containerId)?.stats || []).map((stat) => ({
  date: stat.timestamp,
  value: stat.memory_usage,
}));


const createOption = (): BarChartOptions => ({
  "title": "Memory usage",
  toolbar: {
    enabled: false,
  },
  legend: {
    enabled: false,
  },
  "axes": {
    "left": {
      "mapsTo": "value",
      scaleType: ScaleTypes.LOG,
    },
    "bottom": {
      "mapsTo": "date",
      "scaleType": ScaleTypes.TIME,
      domain: [Date.now() - 60 * 5 * 1000, Date.now()]
    }
  },
  "height": "200px",
  "theme": "g100"
});

let options: BarChartOptions = createOption();
$: options;

onMount(() => {
  return statsHistories.subscribe((stats) => {
    const history = stats.find(history => history.containerId === containerId);
    if(history === undefined)
      return;

    data = history.stats.map((stat) => ({
      date: stat.timestamp,
      value: stat.memory_usage,
    }));

    options = createOption();
  });
})
</script>

{#if data.length === 0}
  <LineChart data="{data}" options="{options}" />
{/if}
