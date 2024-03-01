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
import {
  containerEngine,
  provider,
  type ImageInfo,
  type ProviderContainerConnection, ContainerCreateOptions,
} from '@podman-desktop/api';
import { InferenceServerConfig } from '@shared/src/models/InferenceServerConfig';

export const LABEL_INFERENCE_SERVER: string = 'ai-studio-inference-server';

/**
 * Return container connection provider
 */
export function getContainerConnection(engineId?: string): ProviderContainerConnection {
  // Get started engines
  const engines = provider.getContainerConnections()
    .filter(connection => connection.connection.status() === 'started');

  if(engines.length === 0)
    throw new Error('no engine started could be find.');

  let output: ProviderContainerConnection | undefined = undefined;

  // If we expect a specific engine
  if(engineId !== undefined) {
    output = engines.find(engine => engine.providerId === engineId);
  } else {
    // Have a preference for a podman engine
    output = engines.find(engine => engine.connection.type === 'podman');
    if(output === undefined) {
      output = engines[0];
    }
  }
  if(output === undefined)
    throw new Error('cannot find any started container provider.');
  return output;
}

/**
 * Given an image name, it will return the ImageInfo corresponding. Will raise an error if not found.
 * @param image
 * @param engineId
 */
export async function getImageInfo(image: string, engineId: string): Promise<ImageInfo> {
  console.log(`get image ${image} with engineId ${engineId}.`);
  // Get all images available
  const images = await containerEngine.listImages();
  console.log('all images', JSON.stringify(images));
  // Filter on engineId
  const imageInfo = images.find(im => im.engineId === engineId && im.RepoTags?.some(tag => tag === image));
  // Throw error if not found.
  if(imageInfo === undefined)
    throw new Error(`image ${image} not found.`);
  return imageInfo;
}

export function GenerateContainerCreateOptions(config: InferenceServerConfig): ContainerCreateOptions {
  return {
    Image: config.image.Id,
    Detach: true,
    ExposedPorts: { [`${config.port}`]: {} },
    HostConfig: {
      AutoRemove: true,
      Mounts: [
        {
          Target: '/models',
          Source: config.models,
          Type: 'bind',
        },
      ],
      PortBindings: {
        '8000/tcp': [
          {
            HostPort: `${config.port}`,
          },
        ],
      },
    },
    Labels: {
      ...config.labels,
      LABEL_INFERENCE_SERVER: 'true',
    },
    Env: [`MODEL_PATH=/models/${config.models}`],
    Cmd: ['--models-path', '/models', '--context-size', '700', '--threads', '4'],
  };
}
