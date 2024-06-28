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
import { ApplicationProvider, type ApplicationProviderConfiguration } from './ApplicationProvider';
import {
  containerEngine,
  type HealthConfig,
  type HostConfig,
  type PodCreatePortOptions,
  type PodInfo,
} from '@podman-desktop/api';
import type { Recipe, RecipeImage } from '@shared/src/models/IRecipe';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import { isQEMUMachine } from '../../../utils/podman';
import path from 'node:path';
import { getModelPropertiesForEnvironment } from '../../../utils/modelsUtils';
import { SECOND } from '../inference/PodmanLlamaCppPython';
import { getRandomName } from '../../../utils/randomUtils';
import { getPortsInfo } from '../../../utils/ports';
import {
  POD_LABEL_APP_PORTS,
  POD_LABEL_MODEL_ID,
  POD_LABEL_MODEL_PORTS,
  POD_LABEL_RECIPE_ID,
} from '../../../utils/RecipeConstants';
import type { PodManager } from '../../../managers/recipes/PodManager';
import { RuntimeType } from '@shared/src/models/IInference';
import type { TaskRegistry } from '../../../registries/TaskRegistry';

export class PodmanApplicationProvider extends ApplicationProvider<PodInfo> {
  constructor(private podManager: PodManager, taskRegistry: TaskRegistry) {
    super(RuntimeType.KUBERNETES, taskRegistry);
  }

  override enabled(): boolean {
    return true;
  }

  override async perform(config: ApplicationProviderConfiguration): Promise<PodInfo> {
    const { recipe, model, images, modelPath, labels } = config;

    const task = this.taskRegistry.createTask('Creating AI App', 'loading', labels);

    // create empty pod
    let podInfo: PodInfo;
    try {
      podInfo = await this.createPod(recipe, model, images);
      task.labels = {
        ...task.labels,
        'pod-id': podInfo.Id,
      };
    } catch (e) {
      console.error('error when creating pod', e);
      task.state = 'error';
      task.error = `Something went wrong while creating pod: ${String(e)}`;
      throw e;
    } finally {
      this.taskRegistry.updateTask(task);
    }

    try {
      await this.createContainerAndAttachToPod(podInfo, images, model, modelPath);
      task.state = 'success';
    } catch (e) {
      console.error(`error when creating pod ${podInfo.Id}`, e);
      task.state = 'error';
      task.error = `Something went wrong while creating pod: ${String(e)}`;
      throw e;
    } finally {
      this.taskRegistry.updateTask(task);
    }

    return podInfo;
  }

  async createContainerAndAttachToPod(
    podInfo: PodInfo,
    images: RecipeImage[],
    modelInfo: ModelInfo,
    modelPath: string,
  ): Promise<void> {
    // temporary check to set Z flag or not - to be removed when switching to podman 5
    const isQEMUVM = await isQEMUMachine();
    await Promise.all(
      images.map(async image => {
        let hostConfig: HostConfig | undefined = undefined;
        let envs: string[] = [];
        let healthcheck: HealthConfig | undefined = undefined;
        // if it's a model service we mount the model as a volume
        if (image.modelService) {
          const modelName = path.basename(modelPath);
          hostConfig = {
            Mounts: [
              {
                Target: `/${modelName}`,
                Source: modelPath,
                Type: 'bind',
                Mode: isQEMUVM ? undefined : 'Z',
              },
            ],
          };
          envs = [`MODEL_PATH=/${modelName}`];
          envs.push(...getModelPropertiesForEnvironment(modelInfo));
        } else {
          // TODO: remove static port
          const modelService = images.find(image => image.modelService);
          if (modelService && modelService.ports.length > 0) {
            const endPoint = `http://localhost:${modelService.ports[0]}`;
            envs = [`MODEL_ENDPOINT=${endPoint}`];
          }
        }
        if (image.ports.length > 0) {
          healthcheck = {
            // must be the port INSIDE the container not the exposed one
            Test: ['CMD-SHELL', `curl -s localhost:${image.ports[0]} > /dev/null`],
            Interval: SECOND * 5,
            Retries: 4 * 5,
            Timeout: SECOND * 2,
          };
        }

        const podifiedName = getRandomName(`${image.appName}-podified`);
        await containerEngine.createContainer(podInfo.engineId, {
          Image: image.id,
          name: podifiedName,
          Detach: true,
          HostConfig: hostConfig,
          Env: envs,
          start: false,
          pod: podInfo.Id,
          HealthCheck: healthcheck,
        });
      }),
    );
  }

  async createPod(recipe: Recipe, model: ModelInfo, images: RecipeImage[]): Promise<PodInfo> {
    // find the exposed port of the sample app so we can open its ports on the new pod
    const sampleAppImageInfo = images.find(image => !image.modelService);
    if (!sampleAppImageInfo) {
      console.error('no sample app image found');
      throw new Error('no sample app found');
    }

    const portmappings: PodCreatePortOptions[] = [];
    // we expose all ports so we can check the model service if it is actually running
    for (const image of images) {
      for (const exposed of image.ports) {
        const localPorts = await getPortsInfo(exposed);
        if (localPorts) {
          portmappings.push({
            container_port: parseInt(exposed),
            host_port: parseInt(localPorts),
            host_ip: '',
            protocol: '',
            range: 1,
          });
        }
      }
    }

    // create new pod
    const labels: Record<string, string> = {
      [POD_LABEL_RECIPE_ID]: recipe.id,
      [POD_LABEL_MODEL_ID]: model.id,
    };
    // collecting all modelService ports
    const modelPorts = images
      .filter(img => img.modelService)
      .flatMap(img => img.ports)
      .map(port => portmappings.find(pm => `${pm.container_port}` === port)?.host_port);
    if (modelPorts.length) {
      labels[POD_LABEL_MODEL_PORTS] = modelPorts.join(',');
    }
    // collecting all application ports (excluding service ports)
    const appPorts = images
      .filter(img => !img.modelService)
      .flatMap(img => img.ports)
      .map(port => portmappings.find(pm => `${pm.container_port}` === port)?.host_port);
    if (appPorts.length) {
      labels[POD_LABEL_APP_PORTS] = appPorts.join(',');
    }
    const { engineId, Id } = await this.podManager.createPod({
      name: getRandomName(`pod-${sampleAppImageInfo.appName}`),
      portmappings: portmappings,
      labels,
    });

    return this.podManager.getPod(engineId, Id);
  }

  override dispose(): void {}
}
