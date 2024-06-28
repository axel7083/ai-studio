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
import type { ApplicationProviderConfiguration } from './ApplicationProvider';
import { ApplicationProvider } from './ApplicationProvider';
import type { V1Pod, V1Service } from '@kubernetes/client-node';
import type { RecipeImage } from '@shared/src/models/IRecipe';
import { containerEngine } from '@podman-desktop/api';
import type { TaskRegistry } from '../../../registries/TaskRegistry';
import { InferenceType, RuntimeType } from '@shared/src/models/IInference';
import { getRandomString } from '../../../utils/randomUtils';
import { DEFAULT_NAMESPACE, getCoreV1Api, getLabels } from '../../../registries/KubernetesPodRegistry';
import {
  POD_LABEL_LOCAL_PORT,
  POD_LABEL_MODEL_ID,
  POD_LABEL_RECIPE_ID,
} from '../../../utils/RecipeConstants';
import { AI_LAB_SERVICE_INFERENCE_LABEL } from '../../../managers/inference/kubernetesInferenceManager';
import type { InferenceProviderRegistry } from '../../../registries/InferenceProviderRegistry';
import { getInferenceType } from '../../../utils/inferenceUtils';
import { getFreeRandomPort } from '../../../utils/ports';

export class KubernetesApplicationProvider extends ApplicationProvider<V1Pod> {
  constructor(taskRegistry: TaskRegistry, private inferenceProviderRegistry: InferenceProviderRegistry) {
    super(RuntimeType.KUBERNETES, taskRegistry);
  }

  override enabled(): boolean {
    return true;
  }

  override async perform(config: ApplicationProviderConfiguration): Promise<V1Pod> {
    console.log('[KubernetesApplicationProvider] perform', config);

    const inferenceType = getInferenceType([config.model]);
    if(inferenceType !== InferenceType.LLAMA_CPP) throw new Error('Inference type other than LLAMA_CPP are not compatible with kubernetes runtime.');

    // Get kubernetes inference provider
    const providers = this.inferenceProviderRegistry.getByType(RuntimeType.KUBERNETES, inferenceType);
    if(providers.length === 0) throw new Error('no provider found.');
    const provider = providers[0];

    // first push the images to the registry
    await Promise.all(config.images.map(image => this.pushImage(image, config.labels ?? {})));

    const inferenceLocalPort = await getFreeRandomPort('127.0.0.1');
    // creating inference server
    const modelService = config.images.find(image => image.modelService);
    const inferencePod = await provider.perform({
      labels: config.labels ?? {},
      port: inferenceLocalPort,
      image: modelService?.name,
      runtime: RuntimeType.KUBERNETES,
      modelsInfo: [config.model],
    }) as V1Pod;

    console.log('created inference pod', inferencePod);

    const serviceName = `podman-ai-lab-inference-${getRandomString()}`;
    const serviceBody: V1Service = {
      metadata: {
        name: serviceName,
        labels: getLabels(),
      },
      spec: {
        selector: {
          [AI_LAB_SERVICE_INFERENCE_LABEL.MODEL]: config.model.id,
        },
        ports: [{
          protocol: 'TCP',
          port: 8000,
          targetPort: 8000,
        }],
      },
    };

    const serviceTask = this.taskRegistry.createTask(`Creating service ${serviceBody.metadata?.name}`, 'loading', config.labels);
    try {
      await getCoreV1Api().createNamespacedService(DEFAULT_NAMESPACE, serviceBody);
      serviceTask.state = 'success';
    } catch (err: unknown) {
      serviceTask.state = 'error';
      serviceTask.error = `Something went wrong while trying to create namespaced pod: ${String(err)}`;
      throw err;
    } finally {
      this.taskRegistry.updateTask(serviceTask);
    }

    let localPort = await getFreeRandomPort('127.0.0.1');
    // tentative
    if(localPort === inferenceLocalPort) {
      console.warn('getFreeRandomPort gave two time the same result.');
      localPort += 1;
    }

    const body: V1Pod = {
      metadata: {
        name: `podman-ai-lab-${config.recipe.name}-${getRandomString()}`.toLowerCase(),
        labels: getLabels(),
        annotations: {
          [POD_LABEL_RECIPE_ID]: config.recipe.id,
          [POD_LABEL_MODEL_ID]: config.model.id,
          [POD_LABEL_LOCAL_PORT]: `${localPort}`,
        },
      },
      spec: {
        containers: config.images
          .filter(image => !image.modelService)
          .map(image => ({
            name: image.appName.toLowerCase(),
            image: image.name,
            ports: image.ports.map(port => ({
              containerPort: parseInt(port),
            })),
            env: [
              {
                name: 'MODEL_ENDPOINT',
                value: `http://${serviceName}:8000`,
              },
            ],
          })),
      },
    };

    console.log('[KubernetesApplicationProvider] request body', body);

    let result: { body: V1Pod };
    const podTask = this.taskRegistry.createTask(`Creating pod ${body.metadata?.name}`, 'loading', config.labels);
    try {
      result = await getCoreV1Api().createNamespacedPod(DEFAULT_NAMESPACE, body);
      podTask.state = 'success';
    } catch (err: unknown) {
      console.error(err);
      podTask.state = 'error';
      podTask.error = `Something went wrong while trying to create namespaced pod: ${String(err)}`;
      throw err;
    } finally {
      this.taskRegistry.updateTask(podTask);
    }

    return result.body;
  }

  protected async pushImage(image: RecipeImage, labels: Record<string, string>): Promise<void> {
    console.log(`[KubernetesApplicationProvider] push ${image.id} (${image?.name})`);
    if(!image.name) throw new Error('image do not having registry defined.');

    const pushTask = this.taskRegistry.createTask(`Pushing ${image.name}`, 'loading', {
      ...labels,
      'image-pushing': image.id,
    });
    try {
      console.log('[pushImage] ', image);
      await containerEngine.pushImage(image.engineId, image.name, (name: string, data: string) => {
        console.debug(`[${name}] ${data}`);
      });
      pushTask.state = 'success';
    } catch (err: unknown) {
      console.error(err);
      pushTask.error = `Something went wrong while pushing image: ${String(err)}`;
      pushTask.state = 'error';
      throw err;
    } finally {
      this.taskRegistry.updateTask(pushTask);
    }
  }

  override dispose(): void {}
}
