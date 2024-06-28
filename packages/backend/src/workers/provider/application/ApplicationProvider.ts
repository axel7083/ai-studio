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
import type { IWorker } from '../../IWorker';
import type { Disposable } from '@podman-desktop/api';
import type { Recipe, RecipeImage } from '@shared/src/models/IRecipe';
import type { RuntimeType } from '@shared/src/models/IInference';
import type { TaskRegistry } from '../../../registries/TaskRegistry';
import type { ModelInfo } from '@shared/src/models/IModelInfo';

export interface ApplicationProviderConfiguration {
  recipe: Recipe,
  model: ModelInfo,
  images: RecipeImage[],
  modelPath: string,
  labels?: { [key: string]: string },
}

export abstract class ApplicationProvider<T> implements IWorker<ApplicationProviderConfiguration, T>, Disposable {
  readonly runtime: RuntimeType;

  protected constructor(runtime: RuntimeType, protected taskRegistry: TaskRegistry) {
    this.runtime = runtime;
  }

  abstract enabled(): boolean;
  abstract perform(config: ApplicationProviderConfiguration): Promise<T>;
  abstract dispose(): void;
}
