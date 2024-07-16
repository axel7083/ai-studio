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

import type { ApplicationCatalog } from '@shared/src/models/IApplicationCatalog';
import fs, { promises } from 'node:fs';
import path from 'node:path';
import defaultCatalog from '../assets/ai.json';
import type { Recipe } from '@shared/src/models/IRecipe';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import { Messages } from '@shared/Messages';
import { Disposable, type Webview } from '@podman-desktop/api';
import { JsonWatcher } from '../utils/JsonWatcher';
import { Publisher } from '../utils/Publisher';
import type { LocalModelImportInfo } from '@shared/src/models/ILocalModelInfo';
import { InferenceType } from '@shared/src/models/IInference';
import { CatalogFormat, merge, sanitize } from '../utils/catalogUtils';

export type catalogUpdateHandle = () => void;

export const USER_CATALOG = 'user-catalog.json';

export class CatalogManager extends Publisher<ApplicationCatalog> implements Disposable {
  private catalog: ApplicationCatalog;
  #catalogUpdateListeners: catalogUpdateHandle[];
  #disposables: Disposable[];

  constructor(
    webview: Webview,
    private appUserDirectory: string,
  ) {
    super(webview, Messages.MSG_NEW_CATALOG_STATE, () => this.getCatalog());
    // We start with an empty catalog, for the methods to work before the catalog is loaded
    this.catalog = {
      version: CatalogFormat.CURRENT,
      categories: [],
      models: [],
      recipes: [],
    };

    this.#catalogUpdateListeners = [];
    this.#disposables = [];
  }

  /**
   * The init method will start a watcher on the user catalog.json
   */
  init(): void {
    // Creating a json watcher
    const jsonWatcher: JsonWatcher<unknown> = new JsonWatcher(this.getUserCatalogPath(), {
      version: CatalogFormat.CURRENT,
      recipes: [],
      models: [],
      categories: [],
    });
    jsonWatcher.onContentUpdated(content => this.onUserCatalogUpdate(content));
    jsonWatcher.init();

    this.#disposables.push(jsonWatcher);
  }

  private loadDefaultCatalog(): void {
    this.catalog = defaultCatalog as ApplicationCatalog;
    this.notify();
  }

  private onUserCatalogUpdate(content: unknown): void {
    if (!content || typeof content !== 'object') {
      this.loadDefaultCatalog();
      return;
    }

    // Get the user-catalog version
    let userCatalogFormat: string = CatalogFormat.UNKNOWN;
    if ('version' in content && typeof content.version === 'string') {
      userCatalogFormat = content.version;
    }

    if (userCatalogFormat !== CatalogFormat.CURRENT) {
      this.loadDefaultCatalog();
      console.error(
        `the user-catalog provided is using version ${userCatalogFormat} expected ${CatalogFormat.CURRENT}. You can follow the migration guide.`,
      );
      return;
    }

    // merging default catalog with user catalog
    this.catalog = merge(sanitize(defaultCatalog), sanitize({ ...content, version: userCatalogFormat }));

    this.notify();
  }

  override notify() {
    super.notify();
    this.#catalogUpdateListeners.forEach(listener => listener());
  }

  onCatalogUpdate(listener: catalogUpdateHandle): Disposable {
    this.#catalogUpdateListeners.push(listener);
    return Disposable.create(() => {
      this.#catalogUpdateListeners.splice(this.#catalogUpdateListeners.indexOf(listener), 1);
    });
  }

  dispose(): void {
    this.#disposables.forEach(watcher => watcher.dispose());
  }

  public getCatalog(): ApplicationCatalog {
    return this.catalog;
  }

  public getModels(): ModelInfo[] {
    return this.catalog.models;
  }

  public getModelById(modelId: string): ModelInfo {
    const model = this.getModels().find(m => modelId === m.id);
    if (!model) {
      throw new Error(`No model found having id ${modelId}`);
    }
    return model;
  }

  public getRecipes(): Recipe[] {
    return this.catalog.recipes;
  }

  public getRecipeById(recipeId: string): Recipe {
    const recipe = this.getRecipes().find(r => recipeId === r.id);
    if (!recipe) {
      throw new Error(`No recipe found having id ${recipeId}`);
    }
    return recipe;
  }

  /**
   * This method is used to imports user's local models.
   * @param localModels the models to imports
   */
  async importUserModels(localModels: LocalModelImportInfo[]): Promise<void> {
    const userCatalogPath = this.getUserCatalogPath();
    let content: ApplicationCatalog;

    // check if we already have an existing user's catalog
    if (fs.existsSync(userCatalogPath)) {
      const raw = await promises.readFile(userCatalogPath, 'utf-8');
      content = sanitize(JSON.parse(raw));
    } else {
      content = {
        version: CatalogFormat.CURRENT,
        recipes: [],
        models: [],
        categories: [],
      };
    }

    // Transform local models into ModelInfo
    const models: ModelInfo[] = await Promise.all(
      localModels.map(async local => {
        const statFile = await promises.stat(local.path);
        return {
          id: local.path,
          name: local.name,
          description: `Model imported from ${local.path}`,
          hw: 'CPU',
          file: {
            path: path.dirname(local.path),
            file: path.basename(local.path),
            size: statFile.size,
            creation: statFile.mtime,
          },
          memory: statFile.size,
          backend: local.backend ?? InferenceType.NONE,
        };
      }),
    );

    // Add all our models infos to the user's models catalog
    content.models.push(...models);

    // ensure parent directory exists
    await promises.mkdir(path.dirname(userCatalogPath), { recursive: true });

    // overwrite the existing catalog
    return promises.writeFile(userCatalogPath, JSON.stringify(content, undefined, 2), 'utf-8');
  }

  /**
   * Remove a model from the user's catalog.
   * @param modelId
   */
  async removeUserModel(modelId: string): Promise<void> {
    const userCatalogPath = this.getUserCatalogPath();
    if (!fs.existsSync(userCatalogPath)) {
      throw new Error('User catalog does not exist.');
    }

    const raw = await promises.readFile(userCatalogPath, 'utf-8');
    const content = sanitize(JSON.parse(raw));

    return promises.writeFile(
      userCatalogPath,
      JSON.stringify(
        {
          recipes: content.recipes,
          models: content.models.filter(model => model.id !== modelId),
          categories: content.categories,
        },
        undefined,
        2,
      ),
      'utf-8',
    );
  }

  /**
   * Return the path to the user catalog
   */
  private getUserCatalogPath(): string {
    return path.resolve(this.appUserDirectory, USER_CATALOG);
  }
}
