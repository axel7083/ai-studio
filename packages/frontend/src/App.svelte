<script lang="ts">
import './app.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { router } from 'tinro';
import Route from '/@/Route.svelte';
import Navigation from '/@/lib/Navigation.svelte';
import Dashboard from '/@/pages/Dashboard.svelte';
import Recipes from '/@/pages/Recipes.svelte';
import Applications from './pages/Applications.svelte';
import Preferences from '/@/pages/Preferences.svelte';
import Models from '/@/pages/Models.svelte';
import Recipe from '/@/pages/Recipe.svelte';
import Model from './pages/Model.svelte';
import { onDestroy, onMount } from 'svelte';
import { getRouterState, rpcBrowser } from '/@/utils/client';
import CreateService from '/@/pages/CreateService.svelte';
import Services from '/@/pages/InferenceServers.svelte';
import ServiceDetails from '/@/pages/InferenceServerDetails.svelte';
import Playgrounds from './pages/Playgrounds.svelte';
import Playground from './pages/Playground.svelte';
import PlaygroundCreate from './pages/PlaygroundCreate.svelte';
import ImportModels from './pages/ImportModel.svelte';
import StartRecipe from '/@/pages/StartRecipe.svelte';
import TuneSessions from './pages/TuneSessions.svelte';
import { configuration } from './stores/extensionConfiguration';
import type { ExtensionConfiguration } from '@shared/models/IExtensionConfiguration';
import type { Unsubscriber } from 'svelte/store';
import { MSG_NAVIGATION_ROUTE_UPDATE } from '@shared/Messages';
import GPUPromotion from '/@/lib/notification/GPUPromotion.svelte';
import NewInstructLabSession from '/@/pages/NewInstructLabSession.svelte';
import LocalServer from './pages/server-information/LocalServer.svelte';
import AboutInstructLab from './pages/instructlab/AboutInstructLab.svelte';
import StartInstructLabContainer from '/@/pages/instructlab/StartInstructLabContainer.svelte';
import StartLlamaStackContainer from './pages/llama-stack/StartLlamaStackContainer.svelte';

router.mode.hash();

let isMounted = false;

let experimentalTuning: boolean = false;
const unsubscribers: Unsubscriber[] = [];

onMount(async () => {
  // Load router state on application startup
  const state = await getRouterState();
  router.goto(state.url);
  isMounted = true;

  unsubscribers.push(
    configuration.subscribe((val: ExtensionConfiguration | undefined) => {
      experimentalTuning = val?.experimentalTuning ?? false;
    }),
  );

  unsubscribers.push(
    rpcBrowser.subscribe(MSG_NAVIGATION_ROUTE_UPDATE, location => {
      router.goto(location);
    }).unsubscribe,
  );
});

onDestroy(() => {
  unsubscribers.forEach(unsubscriber => unsubscriber());
});
</script>

<Route path="/*" isAppMounted={isMounted} let:meta>
  <main class="flex flex-col w-screen h-screen overflow-hidden bg-[var(--pd-content-bg)] text-base">
    <div class="flex flex-row w-full h-full overflow-hidden">
      <Navigation meta={meta} />

      <div class="flex flex-col w-full h-full">
        <GPUPromotion />

        <!-- Dashboard -->
        <Route path="/">
          <Dashboard />
        </Route>

        <!-- Recipes Catalog -->
        <Route path="/recipes">
          <Recipes />
        </Route>

        <!-- Applications -->
        <Route path="/applications">
          <Applications />
        </Route>

        <!-- Playgrounds -->
        <Route path="/playgrounds">
          <Playgrounds />
        </Route>
        <Route path="/playground/:id/*" let:meta>
          {#if meta.params.id === 'create'}
            <PlaygroundCreate />
          {:else}
            <Playground playgroundId={meta.params.id} />
          {/if}
        </Route>
        <Route path="/llamastack/*" firstmatch>
          <Route path="/try">
            <StartLlamaStackContainer />
          </Route>
        </Route>
        {#if experimentalTuning}
          <!-- Tune with InstructLab -->
          <Route path="/tune/*" firstmatch>
            <Route path="/start">
              <NewInstructLabSession />
            </Route>
            <Route path="/*">
              <TuneSessions />
            </Route>
          </Route>
        {/if}
        <Route path="/about-instructlab">
          <AboutInstructLab />
        </Route>
        <Route path="/instructlab/*" firstmatch>
          <Route path="/try">
            <StartInstructLabContainer />
          </Route>
        </Route>
        <!-- Preferences -->
        <Route path="/preferences">
          <Preferences />
        </Route>

        <!-- Local Server -->
        <Route path="/local-server">
          <LocalServer />
        </Route>

        <!-- Recipes -->
        <Route path="/recipe/:id/*" firstmatch let:meta>
          <Route path="/start">
            <StartRecipe recipeId={meta.params.id} trackingId={meta.query.trackingId} />
          </Route>
          <Route path="/*">
            <Recipe recipeId={meta.params.id} />
          </Route>
        </Route>

        <!-- Models -->
        <Route path="/models/*" firstmatch>
          <Route path="/import">
            <ImportModels />
          </Route>
          <Route path="/*">
            <Models />
          </Route>
        </Route>

        <Route path="/model/:id/*" let:meta>
          <Model modelId={decodeURIComponent(meta.params.id)} />
        </Route>

        <!-- services -->
        <Route path="/services/*">
          <Services />
        </Route>

        <Route path="/service/:id/*" let:meta>
          {#if meta.params.id === 'create'}
            <CreateService trackingId={meta.query.trackingId} />
          {:else}
            <ServiceDetails containerId={meta.params.id} />
          {/if}
        </Route>
      </div>
    </div>
  </main>
</Route>
