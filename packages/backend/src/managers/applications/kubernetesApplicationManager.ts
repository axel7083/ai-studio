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
import { type KubernetesApplicationProvider } from '../../workers/provider/application/KubernetesApplicationProvider';
import { DELETE} from '@kubernetes/client-node';
import type { ADD, CHANGE, UPDATE, V1Pod, ERROR } from '@kubernetes/client-node';
import { RuntimeType } from '@shared/src/models/IInference';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import type { ApplicationState } from './ApplicationRuntimeEngine';
import { ApplicationRuntimeEngine } from './ApplicationRuntimeEngine';
import type { CatalogManager } from '../catalogManager';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import type { Recipe, RecipeImage } from '@shared/src/models/IRecipe';
import type { RecipeManager } from '../recipes/RecipeManager';
import type { ConfigurationRegistry } from '../../registries/ConfigurationRegistry';
import type {
  KubernetesPodRegistry} from '../../registries/KubernetesPodRegistry';
import { POD_LABEL_MODEL_ID, POD_LABEL_RECIPE_ID } from '../../utils/RecipeConstants';

export interface KubernetesApplicationDetails {
  podInfo: V1Pod;
}

export class KubernetesApplicationManager extends ApplicationRuntimeEngine<KubernetesApplicationDetails> {
  #applications: Map<string, ApplicationState<KubernetesApplicationDetails>>;

  constructor(
    private kubernetesApplicationProvider: KubernetesApplicationProvider,
    taskRegistry: TaskRegistry,
    catalogManager: CatalogManager,
    recipeManager: RecipeManager,
    configurationRegistry: ConfigurationRegistry,
    private kubernetesPodRegistry: KubernetesPodRegistry,
  ) {
    super('kubernetes', RuntimeType.KUBERNETES, taskRegistry, catalogManager, recipeManager, configurationRegistry);

    this.#applications = new Map();
  }

  override init(): void {
    this.kubernetesPodRegistry.onInformerEvent((event) => {
      this.updateStatus(event.status, event.pod);
    });
  }

  protected updateStatus(status: ADD | UPDATE | CHANGE | DELETE | ERROR, pod: V1Pod): void {
    if (!pod.metadata?.uid) throw new Error('invalid pod metadata');

    // ensure the pod is Inference Server and not an application
    if(!pod.metadata?.annotations || !(POD_LABEL_RECIPE_ID in pod.metadata.annotations) ) return;

    if (status === DELETE) {
      this.#applications.delete(pod.metadata.uid);
      return;
    }

    const application = this.fromV1Pod(pod);
    this.#applications.set(application.id, application);
    this.notify();
  }

  private fromV1Pod(pod: V1Pod): ApplicationState<KubernetesApplicationDetails> {
    console.log('[KubernetesApplicationManager] fromV1Pod', pod);
    if (!pod.metadata?.uid) throw new Error('invalid pod metadata');

    if(!pod.metadata?.annotations || !(POD_LABEL_RECIPE_ID in pod.metadata.annotations) ) throw new Error('missing recipe id in pod annotations');
    if(!pod.metadata?.annotations || !(POD_LABEL_MODEL_ID in pod.metadata.annotations) ) throw new Error('missing recipe id in pod annotations');

    return {
      id: pod.metadata.uid,
      runtime: RuntimeType.KUBERNETES,
      status: 'running',
      modelId: pod.metadata.annotations[POD_LABEL_MODEL_ID],
      recipeId: pod.metadata.annotations[POD_LABEL_RECIPE_ID],
      details: {
        podInfo: pod,
      },
      health: 'none',
      modelPorts: [],
      appPorts: [],
    };
  }

  override async startApplication(recipe: Recipe, model: ModelInfo, labels: Record<string, string>): Promise<KubernetesApplicationDetails> {
    console.log('[KubernetesApplicationManager] startApplication');

    // clone recipe (or ensure it is cloned)
    await this.recipeManager.cloneRecipe(recipe, { ...labels, 'model-id': model.id });

    // build all images, one per container (for a basic sample we should have 2 containers = sample app + model service)
    const images: RecipeImage[] = await this.getBuildRecipeImage(recipe,
      {
        ...labels,
        'recipe-id': recipe.id,
        'model-id': model.id,
      },
    );

    const result = await this.kubernetesApplicationProvider.perform({
      recipe: recipe,
      model: model,
      images: images,
      labels: labels,
      modelPath: 'TODO',
    });

    return {
      podInfo: result,
    };
  }

  dispose(): void {
    this.#applications.clear();
  }

  override getApplication(): ApplicationState<KubernetesApplicationDetails>[] {
    return Array.from(this.#applications.values());
  }
}
