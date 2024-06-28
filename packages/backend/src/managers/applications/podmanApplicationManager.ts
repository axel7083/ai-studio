/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import type { Recipe } from '@shared/src/models/IRecipe';
import type { PodContainerInfo, PodInfo, TelemetryLogger } from '@podman-desktop/api';
import { containerEngine, Disposable } from '@podman-desktop/api';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import type { ModelsManager } from '../modelsManager';
import { getPortsFromLabel } from '../../utils/ports';
import { getDurationSecondsSince, timeout } from '../../utils/utils';
import type { PodmanConnection } from '../podmanConnection';
import type { CatalogManager } from '../catalogManager';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import type { PodManager } from '../recipes/PodManager';
import type { RecipeManager } from '../recipes/RecipeManager';
import {
  POD_LABEL_APP_PORTS,
  POD_LABEL_MODEL_ID,
  POD_LABEL_MODEL_PORTS,
  POD_LABEL_RECIPE_ID,
} from '../../utils/RecipeConstants';
import type { PodmanApplicationProvider } from '../../workers/provider/application/PodmanApplicationProvider';
import { ApplicationRuntimeEngine, type ApplicationState } from './ApplicationRuntimeEngine';
import { RuntimeType } from '@shared/src/models/IInference';
import type { ConfigurationRegistry } from '../../registries/ConfigurationRegistry';

export interface PodmanApplicationDetails {
  podInfo: PodInfo,
}

export class PodmanApplicationManager extends ApplicationRuntimeEngine<PodmanApplicationDetails> {
  #applications: Map<string, ApplicationState<PodmanApplicationDetails>>;
  protectTasks: Set<string> = new Set();
  #disposables: Disposable[];

  constructor(
    taskRegistry: TaskRegistry,
    private podmanConnection: PodmanConnection,
    catalogManager: CatalogManager,
    private modelsManager: ModelsManager,
    private telemetry: TelemetryLogger,
    private podManager: PodManager,
    recipeManager: RecipeManager,
    private podmanApplicationProvider: PodmanApplicationProvider,
    configurationRegistry: ConfigurationRegistry,
  ) {
    super('podman', RuntimeType.PODMAN, taskRegistry, catalogManager, recipeManager, configurationRegistry);
    this.#applications = new Map();
    this.#disposables = [];
  }

  override async startApplication(recipe: Recipe, model: ModelInfo, labels: Record<string, string> = {}): Promise<PodmanApplicationDetails> {
    // clear any existing status / tasks related to the pair recipeId-modelId.
    this.taskRegistry.deleteByLabels({
      'recipe-id': recipe.id,
      'model-id': model.id,
    });

    const startTime = performance.now();
    try {
      // init application (git clone, models download etc.)
      const podInfo: PodInfo = await this.initApplication(recipe, model, labels);
      // start the pod
      await this.runApplication(podInfo, {
        ...labels,
        'recipe-id': recipe.id,
        'model-id': model.id,
      });

      // measure init + start time
      const durationSeconds = getDurationSecondsSince(startTime);
      this.telemetry.logUsage('recipe.pull', { 'recipe.id': recipe.id, 'recipe.name': recipe.name, durationSeconds });

      return {
        podInfo: podInfo,
      };
    } catch (err: unknown) {
      const durationSeconds = getDurationSecondsSince(startTime);
      this.telemetry.logError('recipe.pull', {
        'recipe.id': recipe.id,
        'recipe.name': recipe.name,
        durationSeconds,
        message: 'error pulling application',
        error: err,
      });
      throw err;
    }
  }

  /**
   * This method will execute the following tasks
   * - git clone
   * - git checkout
   * - register local repository
   * - download models
   * - upload models
   * - build containers
   * - create pod
   *
   * @param runtime
   * @param recipe
   * @param model
   * @param labels
   * @private
   */
  private async initApplication(
    recipe: Recipe,
    model: ModelInfo,
    labels: Record<string, string> = {},
  ): Promise<PodInfo> {
    // clone the recipe
    await this.recipeManager.cloneRecipe(recipe, { ...labels, 'model-id': model.id });

    // get model by downloading it or retrieving locally
    await this.modelsManager.requestDownloadModel(model, {
      ...labels,
      'recipe-id': recipe.id,
      'model-id': model.id,
    });

    // build all images, one per container (for a basic sample we should have 2 containers = sample app + model service)
    const images = await this.getBuildRecipeImage(
      recipe,
      {
        ...labels,
        'recipe-id': recipe.id,
        'model-id': model.id,
      },
    );

    // upload model to podman machine if user system is supported
    const modelPath = await this.modelsManager.uploadModelToPodmanMachine(model, {
      ...labels,
      'recipe-id': recipe.id,
      'model-id': model.id,
    });

    // first delete any existing pod with matching labels
    if (await this.hasApplicationPod(recipe.id, model.id)) {
      await this.removeApplication(recipe.id, model.id);
    }

    return this.podmanApplicationProvider.perform({
      recipe: recipe,
      model: model,
      images: images,
      modelPath: modelPath,
      labels: {
        ...labels,
        'recipe-id': recipe.id,
        'model-id': model.id,
      },
    });
  }

  /**
   * Given an ApplicationPodInfo, start the corresponding pod
   * @param podInfo
   * @param labels
   */
  async runApplication(podInfo: PodInfo, labels?: { [key: string]: string }): Promise<void> {
    const task = this.taskRegistry.createTask('Starting AI App', 'loading', labels);

    // it starts the pod
    await this.podManager.startPod(podInfo.engineId, podInfo.Id);

    // check if all containers have started successfully
    for (const container of podInfo.Containers ?? []) {
      await this.waitContainerIsRunning(podInfo.engineId, container);
    }

    // Update task registry
    this.taskRegistry.updateTask({
      ...task,
      state: 'success',
      name: 'AI App is running',
    });

    return this.checkPodsHealth();
  }

  async waitContainerIsRunning(engineId: string, container: PodContainerInfo): Promise<void> {
    const TIME_FRAME_MS = 5000;
    const MAX_ATTEMPTS = 60 * (60000 / TIME_FRAME_MS); // try for 1 hour
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const sampleAppContainerInspectInfo = await containerEngine.inspectContainer(engineId, container.Id);
      if (sampleAppContainerInspectInfo.State.Running) {
        return;
      }
      await timeout(TIME_FRAME_MS);
    }
    throw new Error(`Container ${container.Id} not started in time`);
  }


  /**
   * Stop the pod with matching recipeId and modelId
   * @param recipeId
   * @param modelId
   */
  async stopPodApplication(recipeId: string, modelId: string): Promise<PodInfo> {
    // clear existing tasks
    this.clearTasks(recipeId, modelId);

    // get the application pod
    const appPod = await this.getApplicationPod(recipeId, modelId);

    // if the pod is already stopped skip
    if (appPod.Status === 'Exited') {
      return appPod;
    }

    // create a task to follow progress/error
    const stoppingTask = this.taskRegistry.createTask(`Stopping AI App`, 'loading', {
      'recipe-id': recipeId,
      'model-id': modelId,
    });

    try {
      await this.podManager.stopPod(appPod.engineId, appPod.Id);

      stoppingTask.state = 'success';
      stoppingTask.name = `AI App Stopped`;
    } catch (err: unknown) {
      stoppingTask.error = `Error removing the pod.: ${String(err)}`;
      stoppingTask.name = 'Error stopping AI App';
    } finally {
      this.taskRegistry.updateTask(stoppingTask);
      await this.checkPodsHealth();
    }
    return appPod;
  }

  /**
   * Utility method to start a pod using (recipeId, modelId)
   * @param recipeId
   * @param modelId
   */
  async startPodApplication(recipeId: string, modelId: string): Promise<void> {
    this.clearTasks(recipeId, modelId);
    const pod = await this.getApplicationPod(recipeId, modelId);

    return this.runApplication(pod, {
      'recipe-id': recipeId,
      'model-id': modelId,
    });
  }


  init() {
    this.podmanConnection.startupSubscribe(() => {
      this.podManager
        .getPodsWithLabels([POD_LABEL_RECIPE_ID])
        .then(pods => {
          pods.forEach(pod => this.adoptPod(pod));
        })
        .catch((err: unknown) => {
          console.error('error during adoption of existing playground containers', err);
        });
    });

    this.podmanConnection.onMachineStop(() => {
      // Podman Machine has been stopped, we consider all recipe pods are stopped
      for (const key of this.#applications.keys()) {
        this.taskRegistry.createTask('AI App stopped manually', 'success', {
          'application-id': key,
        });
      }

      this.#applications.clear();
      this.notify();
    });

    this.podManager.onStartPodEvent((pod: PodInfo) => {
      this.adoptPod(pod);
    });
    this.podManager.onRemovePodEvent(({ podId }) => {
      this.forgetPodById(podId);
    });

    const ticker = () => {
      this.checkPodsHealth()
        .catch((err: unknown) => {
          console.error('error getting pods statuses', err);
        })
        .finally(() => (timerId = setTimeout(ticker, 10000)));
    };

    // using a recursive setTimeout instead of setInterval as we don't know how long the operation takes
    let timerId = setTimeout(ticker, 1000);

    this.#disposables.push(
      Disposable.create(() => {
        clearTimeout(timerId);
      }),
    );
  }

  private adoptPod(pod: PodInfo) {
    if (!pod.Labels) {
      return;
    }
    const recipeId = pod.Labels[POD_LABEL_RECIPE_ID];
    const modelId = pod.Labels[POD_LABEL_MODEL_ID];
    if (!recipeId || !modelId) {
      return;
    }
    const appPorts = getPortsFromLabel(pod.Labels, POD_LABEL_APP_PORTS);
    const modelPorts = getPortsFromLabel(pod.Labels, POD_LABEL_MODEL_PORTS);
    if (this.#applications.has(pod.Id)) {
      return;
    }
    const state: ApplicationState<PodmanApplicationDetails> = {
      id: pod.Id,
      runtime: RuntimeType.PODMAN,
      status: pod.Status === 'running' ? 'running' : 'error', // todo
      details: {
        podInfo: pod,
      },
      recipeId: recipeId,
      modelId,
      appPorts,
      modelPorts,
      health: 'starting',
    };
    this.updateApplicationState(state);
  }

  private forgetPodById(podId: string) {
    const app = this.#applications.get(podId);
    if (!app) {
      return;
    }

    this.#applications.delete(podId);
    this.notify();

    if (!app.details.podInfo.Labels) {
      return;
    }
    const recipeId = app.details.podInfo.Labels[POD_LABEL_RECIPE_ID];
    const modelId = app.details.podInfo.Labels[POD_LABEL_MODEL_ID];
    if (!recipeId || !modelId) {
      return;
    }
    const protect = this.protectTasks.has(podId);
    if (!protect) {
      this.taskRegistry.createTask('AI App stopped manually', 'success', {
        'recipe-id': recipeId,
        'model-id': modelId,
      });
    } else {
      this.protectTasks.delete(podId);
    }
  }

  private async checkPodsHealth(): Promise<void> {
    const pods = await this.podManager.getPodsWithLabels([POD_LABEL_RECIPE_ID, POD_LABEL_MODEL_ID]);
    let changes = false;

    for (const pod of pods) {
      const state = this.#applications.get(pod.Id);
      if(!state) continue;

      const podHealth = await this.podManager.getHealth(pod);

      if (state && state.health !== podHealth) {
        state.health = podHealth;
        state.details.podInfo = pod;
        this.#applications.set(pod.Id, state);
        changes = true;
      }
      if (pod.Status !== state.details.podInfo.Status) {
        state.details.podInfo = pod;
        changes = true;
      }
    }

    if (changes) {
      this.notify();
    }
  }

  updateApplicationState(state: ApplicationState<PodmanApplicationDetails>): void {
    this.#applications.set(state.details.podInfo.Id, state);
    this.notify();
  }

  override getApplication(): ApplicationState<PodmanApplicationDetails>[] {
    return Array.from(this.#applications.values());
  }

  private clearTasks(recipeId: string, modelId: string): void {
    // clear any existing status / tasks related to the pair recipeId-modelId.
    this.taskRegistry.deleteByLabels({
      'recipe-id': recipeId,
      'model-id': modelId,
    });
  }

  /**
   * Method that will stop then remove a pod corresponding to the recipe and model provided
   * @param recipeId
   * @param modelId
   */
  async removeApplication(recipeId: string, modelId: string): Promise<void> {
    const appPod = await this.stopPodApplication(recipeId, modelId);

    const remoteTask = this.taskRegistry.createTask(`Removing AI App`, 'loading', {
      'recipe-id': recipeId,
      'model-id': modelId,
    });
    // protect the task
    this.protectTasks.add(appPod.Id);

    try {
      await this.podManager.removePod(appPod.engineId, appPod.Id);

      remoteTask.state = 'success';
      remoteTask.name = `AI App Removed`;
    } catch (err: unknown) {
      remoteTask.error = 'error removing the pod. Please try to remove the pod manually';
      remoteTask.name = 'Error stopping AI App';
    } finally {
      this.taskRegistry.updateTask(remoteTask);
    }
  }

  async restartApplication(recipeId: string, modelId: string): Promise<void> {
    const appPod = await this.getApplicationPod(recipeId, modelId);
    await this.removeApplication(recipeId, modelId);
    const recipe = this.catalogManager.getRecipeById(recipeId);
    const model = this.catalogManager.getModelById(appPod.Labels[POD_LABEL_MODEL_ID]);

    // init the recipe
    const podInfo = await this.initApplication(recipe, model);

    // start the pod
    return this.runApplication(podInfo, {
      'recipe-id': recipe.id,
      'model-id': model.id,
    });
  }

  async getApplicationPorts(applicationId: string): Promise<number[]> {
    const state = this.#applications.get(applicationId);
    if (state) {
      return state.appPorts;
    }
    throw new Error(`Cannot find application port for application id ${applicationId}`);
  }

  async getApplicationPod(recipeId: string, modelId: string): Promise<PodInfo> {
    const appPod = await this.findPod(recipeId, modelId);
    if (!appPod) {
      throw new Error(`no pod found with recipe Id ${recipeId} and model Id ${modelId}`);
    }
    return appPod;
  }

  private async hasApplicationPod(recipeId: string, modelId: string): Promise<boolean> {
    const pod = await this.podManager.findPodByLabelsValues({
      LABEL_RECIPE_ID: recipeId,
      LABEL_MODEL_ID: modelId,
    });
    return !!pod;
  }

  private async findPod(recipeId: string, modelId: string): Promise<PodInfo | undefined> {
    return this.podManager.findPodByLabelsValues({
      [POD_LABEL_RECIPE_ID]: recipeId,
      [POD_LABEL_MODEL_ID]: modelId,
    });
  }

  dispose(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
  }
}
