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
  type ContainerCreateOptions,
  type ContainerProviderConnection,
  type ImageInspectInfo,
  type PullEvent,
  type ProviderContainerConnection,
} from '@podman-desktop/api';
import { InferenceServerConfig } from '@shared/src/models/InferenceServerConfig';

export const LABEL_INFERENCE_SERVER: string = 'ai-studio-inference-server';

/**
 * Return container connection provider
 */
export function getProviderContainerConnection(providerId?: string): ProviderContainerConnection {
  // Get started providers
  const providers = provider.getContainerConnections()
    .filter(connection => connection.connection.status() === 'started');

  if(providers.length === 0)
    throw new Error('no engine started could be find.');

  let output: ProviderContainerConnection | undefined = undefined;

  // If we expect a specific engine
  if(providerId !== undefined) {
    output = providers.find(engine => engine.providerId === providerId);
  } else {
    // Have a preference for a podman engine
    output = providers.find(engine => engine.connection.type === 'podman');
    if(output === undefined) {
      output = providers[0];
    }
  }
  if(output === undefined)
    throw new Error('cannot find any started container provider.');
  return output;
}

/**
 * Given an image name, it will return the ImageInspectInfo corresponding. Will raise an error if not found.
 * @param connection
 * @param image
 * @param callback
 */
export async function getImageInspectInfo(connection: ContainerProviderConnection, image: string, callback: (event: PullEvent) => void,): Promise<ImageInspectInfo> {
  console.debug(`get image ${image} with connection ${connection.name}.`);

  let imageInspectInfo: ImageInspectInfo;
  try {
    // Pull image
    await containerEngine.pullImage(connection, image, callback);
    // Get image inspect
    imageInspectInfo = await containerEngine.findImageInspect(connection, image);
  } catch(err: unknown) {
    console.warn('Something went wrong while trying to get image inspect', err);
    throw err;
  }

  if(imageInspectInfo === undefined)
    throw new Error(`image ${image} not found.`);
  else
    return imageInspectInfo;
}

export function GenerateContainerCreateOptions(config: InferenceServerConfig, imageInspectInfo: ImageInspectInfo): ContainerCreateOptions {
  return {
    Image: imageInspectInfo.Id,
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
