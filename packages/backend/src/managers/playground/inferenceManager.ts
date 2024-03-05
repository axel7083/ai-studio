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
  ContainerInfo,
  Disposable,
  ImageInfo,
  PullEvent,
  type TelemetryLogger, type Webview,
} from '@podman-desktop/api';
import { ContainerRegistry, ContainerStart } from '../../registries/ContainerRegistry';
import {
  GenerateContainerCreateOptions,
  getImageInfo, getProviderContainerConnection,
  LABEL_INFERENCE_SERVER,
} from '../../utils/inferenceUtils';
import { Publisher } from '../../utils/Publisher';
import { MSG_INFERENCE_SERVERS_UPDATE } from '@shared/Messages';
import type { InferenceServerConfig } from '@shared/src/models/InferenceServerConfig';
import { Manager } from '../IManager';

export class InferenceManager extends Publisher<InferenceServer[]> implements Manager {
  // Inference server map (containerId -> InferenceServer)
  #servers: Map<string, InferenceServer>;
  // Is initialized
  #initialized: boolean;
  // Disposables
  #disposables: Disposable[];

  constructor(
    webview: Webview,
    private containerRegistry: ContainerRegistry,
    private podmanConnection: PodmanConnection,
    private telemetry: TelemetryLogger
  ) {
    super(webview, MSG_INFERENCE_SERVERS_UPDATE, () => this.getServers());
    this.#servers = new Map<string, InferenceServer>();
    this.#disposables = [];
    this.#initialized = false;
  }

  init(): Disposable {
    this.podmanConnection.onMachineStart(this.watchMachineEvent.bind(this, 'start'));
    this.podmanConnection.onMachineStop(this.watchMachineEvent.bind(this, 'stop'));
    const onStartContainerEventDisposable = this.containerRegistry.onStartContainerEvent(this.watchContainerStart.bind(this));

    this.retryableRefresh(3);

    return Disposable.from(
      onStartContainerEventDisposable,
      this.cleanDisposables.bind(this)
    );
  }

  public isInitialize(): boolean {
    return this.#initialized;
  }

  /**
   * Clean class disposables
   */
  private cleanDisposables(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
  }

  /**
   * Get the Inference servers
   */
  public getServers(): InferenceServer[] {
    return Array.from(this.#servers.values());
  }

  /**
   * This method add a log entry to the InferenceServer journal
   * /!\ This is not related to the container logs.
   *
   * @param containerId the container identifier of the inference server
   * @param message the log message to append
   * @deprecated
   */
  private log(containerId: string, message: string): void {
    const server = this.#servers.get(containerId);
    if(server === undefined)
      return;

    console.debug(`[${containerId}]: ${message}`);

    this.#servers.set(containerId, {
      ...server,
      logs: (server.logs !== undefined)?[...server.logs, message]:[message],
    })
    this.notify();
  }

  /**
   * Given an engineId, it will start an inference server.
   * @param config
   */
  async startInferenceServer(config: InferenceServerConfig): Promise<void> {
    console.log(`[InferenceManager] startInferenceServer`);
    if(!this.#initialized)
      throw new Error('Cannot start the inference server: not initialized.');

    // Fetch a provider container connection
    const provider = getProviderContainerConnection(config.providerId);
    console.log(`[InferenceManager] startInferenceServer: got provider ${provider.providerId}`);

    // Get the image inspect info
    const imageInfo: ImageInfo = await getImageInfo(provider.connection, config.image, (event: PullEvent) => {
      console.debug('pull image event', event);
    });
    console.log(`[InferenceManager] startInferenceServer: got imageInfo engineId ${imageInfo.engineId} imageId ${imageInfo.Id}`);

    // Create container on requested engine
    const result = await containerEngine.createContainer(
      imageInfo.engineId,
      GenerateContainerCreateOptions(config, imageInfo),
    );

    console.log(`[InferenceManager] startInferenceServer: container created ${result.id}`);

    // Adding a new inference server
    this.#servers.set(result.id, {
      container: {
        engineId: imageInfo.engineId,
        containerId: result.id,
      },
      connection: {
        port: config.port,
      },
      status: 'running',
      models: config.modelsInfo,
    });

    // Watch for container changes
    this.watchContainerStatus(imageInfo.engineId, result.id);

    // Log usage
    this.telemetry.logUsage('inference.start', {
      models: config.modelsInfo.map(model => model.id),
    });

    this.notify();
  }

  /**
   * Given an engineId and a containerId, inspect the container and update the servers
   * @param engineId
   * @param containerId
   * @private
   */
  private updateServerStatus(engineId: string, containerId: string): void {
    console.log(`[InferenceManager] updateServerStatus engineId ${engineId} containerId ${containerId}`);
    // Inspect container
    containerEngine.inspectContainer(engineId, containerId).then(result => {
      const server = this.#servers.get(containerId);
      if(server === undefined)
        throw new Error('Something went wrong while trying to get container status got undefined Inference Server.');

      console.log(`container ${containerId} state`, result.State);
      this.log(containerId, `[INFO] state: ${result.State}.`);
      this.log(containerId, `[DEBUG] health status: ${result.State.Health.Status}.`);

      // Update server
      this.#servers.set(containerId, {
        ...server,
        status: (result.State.Status === 'running')?'running':'stopped',
        health: result.State.Health,
      });
    }).catch((err: unknown) => {
      console.error(`Something went wrong while trying to inspect container ${containerId}. Trying to refresh servers.`, err);
      this.retryableRefresh(2);
    });
  }

  /**
   * Watch for container status changes
   * @param engineId
   * @param containerId the container to watch out
   */
  private watchContainerStatus(engineId: string, containerId: string): void {
    console.log(`[InferenceManager] watchContainerStatus engineId ${engineId} containerId ${containerId}`);
    // Update now
    this.updateServerStatus(engineId, containerId);

    // Create a pulling update for container health check
    const intervalId = setInterval(
      this.updateServerStatus.bind(this, engineId, containerId),
      10000
    );

    this.#disposables.push(Disposable.create(() => {
      clearInterval(intervalId);
    }));
    // Subscribe to container status update
    const disposable = this.containerRegistry.subscribe(containerId, (status: string) => {
      console.log(`watchContainerStatus status: ${status}`);
      switch (status) {
        case 'remove':
          // Update the list of servers
          this.removeInferenceServer(containerId);
          disposable.dispose();
          clearInterval(intervalId);
          break;
      }
    });
    // Allowing cleanup if extension is stopped
    this.#disposables.push(disposable);
  }

  private watchMachineEvent(_event: 'start' | 'stop'): void {
    this.retryableRefresh(2);
  }

  /**
   * Listener for container start events
   * @param event the event containing the id of the container
   */
  private watchContainerStart(event: ContainerStart): void {
    console.log(`[InferenceManager] watchContainerStart ${event}`);
    // We might have a start event for an inference server we already know about
    if(this.#servers.has(event.id))
      return;

    containerEngine.listContainers().then((containers) => {
      const container = containers.find(c => c.Id === event.id);
      if(container === undefined) {
        return;
      }
      if(container.Labels && LABEL_INFERENCE_SERVER in container.Labels) {
        this.watchContainerStatus(container.engineId, container.Id);
      }
    }).catch((err: unknown) => {
      console.error(`Something went wrong in container start listener.`, err);
    });
  }

  /**
   * This non-async utility method is made to retry refreshing the inference server with some delay
   * in case of error raised.
   *
   * @param retry the number of retry allowed
   */
  private retryableRefresh(retry: number = 3): void {
    if(retry === 0) {
      console.error('Cannot refresh inference servers: retry limit has been reached. Cleaning manager.');
      this.cleanDisposables();
      this.#servers.clear();
      this.#initialized = false;
      return;
    }
    this.refreshInferenceServers().catch((err: unknown): void => {
      console.warn(`Something went wrong while trying to refresh inference server. (retry left ${retry})`, err);
      setTimeout(() => {
        this.retryableRefresh(retry - 1);
      }, 2000 + Math.random() * 1000);
    });
  }

  /**
   * Refresh the inference servers by listing all containers.
   *
   * This method has an important impact as it (re-)create all inference servers
   */
  private async refreshInferenceServers(): Promise<void> {
    console.log('[InferenceManager] refreshInferenceServers');
    const containers: ContainerInfo[] = await containerEngine.listContainers();
    console.log(`[InferenceManager] found ${containers.length} containers.`);
    const filtered = containers.filter(
      c => c.Labels && LABEL_INFERENCE_SERVER in c.Labels,
    );
    console.log(`[InferenceManager] ${filtered.length} has the proper label.`);

    // clean existing disposables
    this.cleanDisposables();
    this.#servers = new Map<string, InferenceServer>(filtered.map(containerInfo => [
      containerInfo.Id,
      {
        container: {
          containerId: containerInfo.Id,
          engineId: containerInfo.engineId,
        },
        connection: {
          port: (containerInfo.Ports.length > 0)?containerInfo.Ports[0].PublicPort:-1,
        },
        status: (containerInfo.Status === 'running')?'running':'stopped',
        models: [], // Will be fetched later through the API
      }
    ]));

    console.log(`[InferenceManager] added ${this.#servers.size} server to #servers.`);

    // (re-)create container watchers
    this.#servers.forEach(server => this.watchContainerStatus(
      server.container.engineId,
      server.container.containerId
    ));
    this.#initialized = true;
    // notify update
    this.notify();
  }

  /**
   * Remove the InferenceServer instance from #servers using the containerId
   * @param containerId the id of the container running the Inference Server
   */
  private removeInferenceServer(containerId: string): void {
    this.#servers.delete(containerId);
    this.notify();
  }

  /**
   * Stop an inference server from the container id
   * @param containerId the identifier of the container to stop
   */
  async stopInferenceServer(containerId?: string): Promise<void> {
    if(!this.#initialized)
      throw new Error('Cannot stop the inference server.');

    const server = this.#servers.get(containerId);
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
