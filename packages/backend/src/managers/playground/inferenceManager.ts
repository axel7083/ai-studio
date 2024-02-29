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
import { InferenceServer } from '@shared/src/models/IInference';
import type { PodmanConnection } from '../podmanConnection';
import {
  containerEngine,
  ImageInfo,
  provider,
  type ProviderContainerConnection,
  type TelemetryLogger,
} from '@podman-desktop/api';
import { getFreePort } from '../../utils/ports';
import path from 'node:path';
import { LABEL_MODEL_ID, LABEL_MODEL_PORT } from './playground';
import type { ContainerRegistry } from '../../registries/ContainerRegistry';

/**
 * Return the first started podman container connection provider
 */
function getPodmanContainerConnection(): ProviderContainerConnection {
  const engine = provider
    .getContainerConnections()
    .filter(connection => connection.connection.type === 'podman')
    .find(connection => connection.connection.status() === 'started');
  if(engine === undefined)
    throw new Error('cannot find any started podman container provider.')
  return engine;
}

/**
 * Given an image name, it will return the ImageInfo corresponding. Will raise an error if not found.
 * @param image
 */
async function getImageInfo(image: string): Promise<ImageInfo> {
  const imageInfo = (await containerEngine.listImages()).find(im => im.RepoTags?.some(tag => tag === image));
  if(imageInfo === undefined)
    throw new Error(`image ${image} not found.`);
  return imageInfo;
}

const PLAYGROUND_IMAGE = 'quay.io/bootsy/playground:v0';

export class InferenceManager {
  #server: InferenceServer | undefined = undefined;
  #initialized: boolean = false;

  constructor(private containerRegistry: ContainerRegistry, private podmanConnection: PodmanConnection, private telemetry: TelemetryLogger) {}

  init(): void {
    // TODO: define listeners

    this.#initialized = true;
  }

  async startInferenceServer(): Promise<void> {
    if(!this.#initialized || this.#server !== undefined)
      throw new Error('Cannot start the inference server.');

    const connection = getPodmanContainerConnection();

    let image: ImageInfo;
    try {
      image = await getImageInfo(PLAYGROUND_IMAGE);
    } catch (err: unknown) {
      await containerEngine.pullImage(connection.connection, PLAYGROUND_IMAGE, () => {});
      image = await getImageInfo(PLAYGROUND_IMAGE);
    }

    const freePort = await getFreePort();
    const result = await containerEngine.createContainer(image.engineId, {
      Image: image.Id,
      Detach: true,
      ExposedPorts: { ['' + freePort]: {} },
      HostConfig: {
        AutoRemove: true,
        PortBindings: {
          '8000/tcp': [
            {
              HostPort: '' + freePort,
            },
          ],
        },
      },
      Labels: {
        [LABEL_MODEL_PORT]: `${freePort}`,
      },
      Cmd: ['--models-path', '/models', '--context-size', '700', '--threads', '4'],
    });

    this.#server = {
      container: {
        containerId: result.id,
        port: freePort,
        engineId: image.engineId,
      },
      status: 'running',
      models: [],
      ready: false,
    }
  }

  private watchContainer(containerId: string): void {
    const disposable = this.containerRegistry.subscribe(containerId, (status: string) => {
      switch (status) {
        case 'remove':
        case 'die':
        case 'cleanup':
          this.#server = undefined;
          disposable.dispose();
          break;
      }
    });
  }

  async stopInferenceServer(): Promise<void> {
    if(!this.#initialized || this.#server === undefined)
      throw new Error('Cannot stop the inference server.');


  }
}
