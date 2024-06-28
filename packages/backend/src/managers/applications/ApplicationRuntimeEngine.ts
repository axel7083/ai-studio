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
import { type Disposable, type Event, EventEmitter, ProgressLocation, window } from '@podman-desktop/api';
import type { RuntimeType } from '@shared/src/models/IInference';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import type { ApplicationStatus, PodHealth } from '@shared/src/models/IApplicationState';
import type { Recipe, RecipeImage, StartRecipeConfig } from '@shared/src/models/IRecipe';
import { getRandomString } from '../../utils/randomUtils';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import type { CatalogManager } from '../catalogManager';
import { RecipeManager } from '../recipes/RecipeManager';
import { ConfigurationRegistry } from '../../registries/ConfigurationRegistry';

export interface ApplicationState<T> {
  id: string; // unique identifier (usually the pod id)

  runtime: RuntimeType,
  details: T,
  recipeId: string;
  modelId: string;
  appPorts: number[];
  modelPorts: number[];
  health: PodHealth;
  status: ApplicationStatus,
}

export abstract class ApplicationRuntimeEngine<T> implements Disposable {
  id: string;
  runtime: RuntimeType;

  protected readonly _onUpdate = new EventEmitter<ApplicationState<T>[]>();
  readonly onUpdate: Event<ApplicationState<T>[]> = this._onUpdate.event;

  protected constructor(
    id: string,
    runtime: RuntimeType,
    protected taskRegistry: TaskRegistry,
    protected catalogManager: CatalogManager,
    protected recipeManager: RecipeManager,
    protected configurationRegistry: ConfigurationRegistry,
  ) {
    this.id = id;
    this.runtime = runtime;
  }

  protected notify(): void {
    this._onUpdate.fire(this.getApplication());
  }

  abstract init(): void;
  abstract dispose(): void;

  abstract getApplication(): ApplicationState<T>[];

  protected getBuildRecipeImage(recipe: Recipe, labels: Record<string, string>): Promise<RecipeImage[]> {
    return this.recipeManager.buildRecipe(
      recipe,
      {
        ...labels,
        'recipe-id': recipe.id,
      },
      this.configurationRegistry.getExtensionConfiguration().imageRegistry,
    );
  }

  public requestStart(config: StartRecipeConfig): string {
    const recipe = this.catalogManager.getRecipes().find(recipe => recipe.id === config.recipeId);
    if (!recipe) throw new Error(`recipe with if ${config.recipeId} not found`);

    const model = this.catalogManager.getModelById(config.modelId);

    // create a tracking id to put in the labels
    const trackingId: string = getRandomString();

    const labels: Record<string, string> = {
      trackingId: trackingId,
    };

    const task = this.taskRegistry.createTask(`Pulling ${recipe.name} recipe`, 'loading', {
      ...labels,
      'recipe-pulling': recipe.id, // this label should only be on the master task
    });

    window
      .withProgress({ location: ProgressLocation.TASK_WIDGET, title: `Pulling ${recipe.name}.` }, () =>
        this.startApplication(recipe, model, labels),
      )
      .then(() => {
        task.state = 'success';
      })
      .catch((err: unknown) => {
        task.state = 'error';
        task.error = `Something went wrong while pulling ${recipe.name}: ${String(err)}`;
      })
      .finally(() => {
        this.taskRegistry.updateTask(task);
      });

    return trackingId;
  }

  abstract startApplication(recipe: Recipe, model: ModelInfo, labels: Record<string, string>): Promise<T>;
}
