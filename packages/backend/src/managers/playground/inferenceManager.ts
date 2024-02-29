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
import type { InferenceServer } from '@shared/src/models/IInference';
import type { PodmanConnection } from '../podmanConnection';
import {
  containerEngine,
  type TelemetryLogger, type Webview,
} from '@podman-desktop/api';
import type { ContainerRegistry } from '../../registries/ContainerRegistry';
import { GenerateContainerCreateOptions } from '../../utils/inferenceUtils';
import { Publisher } from '../../utils/Publisher';
import { MSG_INFERENCE_SERVERS_UPDATE } from '@shared/Messages';
import type { InferenceServerConfig } from '../../models/InferenceServerConfig';

export class InferenceManager extends Publisher<InferenceServer[]>{
  // List of inference servers
  #servers: InferenceServer[];
  // Is initialized
  #initialized: boolean = false;

  constructor(webview: Webview, private containerRegistry: ContainerRegistry, private podmanConnection: PodmanConnection, private telemetry: TelemetryLogger) {
    super(webview, MSG_INFERENCE_SERVERS_UPDATE, () => this.getServers());
    this.#servers = [];
  }

  init(): void {
    // TODO: define listeners
    this.#initialized = true;
  }

  /**
   * Get the Inference servers
   */
  public getServers(): InferenceServer[] {
    return this.#servers;
  }

  /**
   * Given an engineId, it will start an inference server.
   * @param config
   */
  async startInferenceServer(config: InferenceServerConfig): Promise<void> {
    if(!this.#initialized)
      throw new Error('Cannot start the inference server: not initialized.');

    const result = await containerEngine.createContainer(config.image.engineId, GenerateContainerCreateOptions(config));

    // Watch for container changes
    this.watchContainerStatus(result.id);

    // Adding a new inference server
    this.#servers.push({
      container: {
        containerId: result.id,
        port: config.port,
        engineId: config.image.engineId,
      },
      status: 'running',
      models: [],
      ready: false,
    });
    this.notify();
  }

  /**
   * Watch for container status changes
   * @param containerId the container to watch out
   */
  private watchContainerStatus(containerId: string): void {
    const disposable = this.containerRegistry.subscribe(containerId, (status: string) => {
      switch (status) {
        case 'remove':
        case 'die':
        case 'cleanup':
          // Update the list of servers
          this.removeInferenceServer(containerId);
          disposable.dispose();
          break;
      }
    });
  }

  /**
   * Remove the InferenceServer instance from #servers using the containerId
   * @param containerId the id of the container running the Inference Server
   */
  private removeInferenceServer(containerId: string): void {
    this.#servers = this.#servers.filter(server => server.container.containerId !== containerId);
    this.notify();
  }

  /**
   * Stop an inference server from the container id
   * @param containerId the identifier of the container to stop
   */
  async stopInferenceServer(containerId?: string): Promise<void> {
    if(!this.#initialized)
      throw new Error('Cannot stop the inference server.');

    const server = this.#servers.find(server => server.container.containerId === containerId);
    if(server === undefined)
      throw new Error(`cannot find a corresponding server for container id ${containerId}.`);

    try {
      await containerEngine.stopContainer(server.container.engineId, server.container.containerId);
      this.removeInferenceServer(containerId);
    } catch (error: unknown) {
      console.error(error);
      this.telemetry.logError('inference.stop', {
        message: 'error stopping inference',
        error: error,
      });
    }
  }
}
