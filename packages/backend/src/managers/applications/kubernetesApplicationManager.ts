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
import type { V1Pod } from '@kubernetes/client-node';
import { RuntimeType } from '@shared/src/models/IInference';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import type { ApplicationState } from './ApplicationRuntimeEngine';
import { ApplicationRuntimeEngine } from './ApplicationRuntimeEngine';
import { ApplicationRegistry } from '../../registries/ApplicationRegistry';
import type { PodmanApplicationDetails } from './podmanApplicationManager';
import type { CatalogManager } from '../catalogManager';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import type { Recipe } from '@shared/src/models/IRecipe';

export interface KubernetesApplicationDetails {
  podInfo: V1Pod;
}

export class KubernetesApplicationManager extends ApplicationRuntimeEngine<KubernetesApplicationDetails> {
  #applications: ApplicationRegistry<ApplicationState<KubernetesApplicationDetails>>;

  constructor(private kubernetesApplicationProvider: KubernetesApplicationProvider, taskRegistry: TaskRegistry, catalogManager: CatalogManager) {
    super('kubernetes', RuntimeType.KUBERNETES, taskRegistry, catalogManager);

    this.#applications = new ApplicationRegistry<ApplicationState<PodmanApplicationDetails>>();
  }

  override init(): void {}

  override async startApplication(recipe: Recipe, model: ModelInfo, labels: Record<string, string>): Promise<void> {

    await this.kubernetesApplicationProvider.perform({
      recipe: recipe,
      model: model,
      images: [],
      labels: labels,
      modelPath: 'TODO',
    });
    throw new Error('Method not implemented.');
  }

  dispose(): void {
    this.#applications.clear();
  }

  override getApplication(): ApplicationState<KubernetesApplicationDetails>[] {
    return Array.from(this.#applications.values());
  }
}
