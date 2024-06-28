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
import { ApplicationProvider, ApplicationProviderConfiguration } from './ApplicationProvider';
import type { V1Pod } from '@kubernetes/client-node';
import { RecipeImage } from '@shared/src/models/IRecipe';
import { containerEngine } from '@podman-desktop/api';
import { TaskRegistry } from '../../../registries/TaskRegistry';
import { RuntimeType } from '@shared/src/models/IInference';

export class KubernetesApplicationProvider extends ApplicationProvider<V1Pod> {

  constructor(taskRegistry: TaskRegistry) {
    super(RuntimeType.KUBERNETES, taskRegistry);
  }

    override enabled(): boolean {
        throw new Error('Method not implemented.');
    }
    override async perform(config: ApplicationProviderConfiguration): Promise<V1Pod> {
      // first push the images to the registry
      await Promise.all(config.images.map(image => this.pushImage(image, config.labels ?? {})));

      throw new Error('method not implemented yet');
    }


  protected async pushImage(image: RecipeImage, labels: Record<string, string>): Promise<void> {
    if(!image.name) throw new Error('image do not having registry defined.');

    const pushTask = this.taskRegistry.createTask(`Pushing ${image.name}`, 'loading', {
      ...labels,
      'image-pushing': image.id,
    });
    try {
      await containerEngine.pushImage(image.engineId, image.id, () => {});
      pushTask.state = 'success';
    } catch (err: unknown) {
      pushTask.error = `Something went wrong while pushing image: ${String(err)}`;
      pushTask.state = 'error';
      throw err;
    } finally {
      this.taskRegistry.updateTask(pushTask);
    }
  }

  override dispose(): void {}
}
