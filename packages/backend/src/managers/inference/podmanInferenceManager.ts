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
import { InferenceServerStatus, InferenceType, RuntimeType } from '@shared/src/models/IInference';
import type { PodmanConnection } from '../podmanConnection';
import podmanDesktopApi, {
  containerEngine,
  type ContainerInfo,
  Disposable,
  type TelemetryLogger,
} from '@podman-desktop/api';
import type { ContainerRegistry, ContainerStart } from '../../registries/ContainerRegistry';
import { getInferenceType, isTransitioning, LABEL_INFERENCE_SERVER } from '../../utils/inferenceUtils';
import type { InferenceServerConfig } from '@shared/src/models/InferenceServerConfig';
import type { ModelsManager } from '../modelsManager';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import { basename, dirname } from 'node:path';
import type { InferenceProviderRegistry } from '../../registries/InferenceProviderRegistry';
import type { PodmanInferenceProvider } from '../../workers/provider/PodmanInferenceProvider';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import type { CatalogManager } from '../catalogManager';
import { type InferenceServerInstance, RuntimeEngine } from './RuntimeEngine';

export interface PodmanInferenceDetails {
  engineId: string;
  containerId: string;
}

export class PodmanInferenceManager extends RuntimeEngine<PodmanInferenceDetails> {
  // Inference server map (containerId -> InferenceServerInstance)
  #servers: Map<string, InferenceServerInstance<PodmanInferenceDetails>>;
  // Is initialized
  #initialized: boolean;
  // Disposables
  #disposables: Disposable[];

  constructor(
    private containerRegistry: ContainerRegistry,
    private podmanConnection: PodmanConnection,
    private modelsManager: ModelsManager,
    private telemetry: TelemetryLogger,
    taskRegistry: TaskRegistry,
    private inferenceProviderRegistry: InferenceProviderRegistry,
    private catalogManager: CatalogManager,
  ) {
    super('podman', RuntimeType.PODMAN, taskRegistry);
    this.#servers = new Map<string, InferenceServerInstance<PodmanInferenceDetails>>();
    this.#disposables = [];
    this.#initialized = false;
  }

  override init(): void {
    this.podmanConnection.onMachineStart(this.watchMachineEvent.bind(this, 'start'));
    this.podmanConnection.onMachineStop(this.watchMachineEvent.bind(this, 'stop'));
    this.containerRegistry.onStartContainerEvent(this.watchContainerStart.bind(this));
    this.catalogManager.onCatalogUpdate(() => {
      this.retryableRefresh(3);
    });
  }

  public isInitialize(): boolean {
    return this.#initialized;
  }

  /**
   * Cleanup the manager
   */
  override dispose(): void {
    this.cleanDisposables();
    this.#servers.clear();
    this.#initialized = false;
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
  override getServers(): InferenceServerInstance<PodmanInferenceDetails>[] {
    return Array.from(this.#servers.values());
  }

  /**
   * return an inference server
   * @param containerId the containerId of the inference server
   */
  public get(containerId: string): InferenceServerInstance<PodmanInferenceDetails> | undefined {
    return this.#servers.get(containerId);
  }

  /**
   * Given an engineId, it will create an inference server using an PodmanInferenceProvider.
   * @param config
   *
   * @return the containerId of the created inference server
   */
  override async create(config: InferenceServerConfig): Promise<InferenceServerInstance<PodmanInferenceDetails>> {
    if (!this.isInitialize()) throw new Error('Cannot start the inference server: not initialized.');

    // Get the backend for the model inference server {@link InferenceType}
    const backend: InferenceType = getInferenceType(config.modelsInfo);

    let provider: PodmanInferenceProvider;
    if (config.inferenceProvider) {
      provider = this.inferenceProviderRegistry.get<PodmanInferenceProvider>(
        RuntimeType.PODMAN,
        config.inferenceProvider,
      );
      if (!provider.enabled()) throw new Error('provider requested is not enabled.');
    } else {
      const providers: PodmanInferenceProvider[] = this.inferenceProviderRegistry
        .getByType<PodmanInferenceProvider>(RuntimeType.PODMAN, backend)
        .filter(provider => provider.enabled());
      if (providers.length === 0) throw new Error('no enabled provider could be found.');
      provider = providers[0];
    }

    // upload models to podman machine if user system is supported
    config.modelsInfo = await Promise.all(
      config.modelsInfo.map(modelInfo =>
        this.modelsManager.uploadModelToPodmanMachine(modelInfo, config.labels).then(path => ({
          ...modelInfo,
          file: {
            path: dirname(path),
            file: basename(path),
          },
        })),
      ),
    );

    // create the inference server using the selected inference provider
    const result = await provider.perform(config);

    const instance: InferenceServerInstance<PodmanInferenceDetails> = {
      id: result.id,
      details: {
        engineId: result.engineId,
        containerId: result.id,
      },
      connection: {
        port: config.port,
        host: 'localhost',
      },
      status: 'running',
      models: config.modelsInfo,
      type: backend,
      runtime: RuntimeType.PODMAN,
      stop: this.stopInferenceServer.bind(this, result.id),
      start: this.startInferenceServer.bind(this, result.id),
      remove: this.deleteInferenceServer.bind(this, result.id),
      navigate: () => podmanDesktopApi.navigation.navigateToContainer(result.id),
    };

    // Adding a new inference server
    this.#servers.set(result.id, instance);

    // Watch for container changes
    this.watchContainerStatus(result.engineId, result.id);

    // Log usage
    this.telemetry.logUsage('inference.start', {
      models: config.modelsInfo.map(model => model.id),
    });

    this.notify();
    return instance;
  }

  /**
   * Given an engineId and a containerId, inspect the container and update the servers
   * @param engineId
   * @param containerId
   * @private
   */
  private updateServerStatus(engineId: string, containerId: string): void {
    // Inspect container
    containerEngine
      .inspectContainer(engineId, containerId)
      .then(result => {
        const server = this.#servers.get(containerId);
        if (server === undefined)
          throw new Error('Something went wrong while trying to get container status got undefined Inference Server.');

        // we should not update the server while we are in a transition state.
        if (isTransitioning(server)) return;

        // Update server
        this.#servers.set(containerId, {
          ...server,
          status: result.State.Status === 'running' ? 'running' : 'stopped',
          health: result.State.Health,
        });
        this.notify();
      })
      .catch((err: unknown) => {
        console.error(
          `Something went wrong while trying to inspect container ${containerId}. Trying to refresh servers.`,
          err,
        );
        this.retryableRefresh(2);
      });
  }

  /**
   * Watch for container status changes
   * @param engineId
   * @param containerId the container to watch out
   */
  private watchContainerStatus(engineId: string, containerId: string): void {
    // Update now
    this.updateServerStatus(engineId, containerId);

    // Create a pulling update for container health check
    const intervalId = setInterval(this.updateServerStatus.bind(this, engineId, containerId), 10000);

    this.#disposables.push(
      Disposable.create(() => {
        clearInterval(intervalId);
      }),
    );
    // Subscribe to container status update
    const disposable = this.containerRegistry.subscribe(containerId, (status: string) => {
      switch (status) {
        case 'die':
          this.updateServerStatus(engineId, containerId);
          clearInterval(intervalId);
          break;
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
    // We might have a start event for an inference server we already know about
    if (this.#servers.has(event.id)) return;

    containerEngine
      .listContainers()
      .then(containers => {
        const container = containers.find(c => c.Id === event.id);
        if (container === undefined) {
          return;
        }
        if (container.Labels && LABEL_INFERENCE_SERVER in container.Labels) {
          this.watchContainerStatus(container.engineId, container.Id);
        }
      })
      .catch((err: unknown) => {
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
    if (retry === 0) {
      console.error('Cannot refresh inference servers: retry limit has been reached. Cleaning manager.');
      this.cleanDisposables();
      this.#servers.clear();
      this.#initialized = false;
      return;
    }
    this.refreshInferenceServers().catch((err: unknown): void => {
      console.warn(`Something went wrong while trying to refresh inference server. (retry left ${retry})`, err);
      setTimeout(
        () => {
          this.retryableRefresh(retry - 1);
        },
        2000 + Math.random() * 1000,
      );
    });
  }

  /**
   * Refresh the inference servers by listing all containers.
   *
   * This method has an important impact as it (re-)create all inference servers
   */
  private async refreshInferenceServers(): Promise<void> {
    const containers: ContainerInfo[] = await containerEngine.listContainers();
    const filtered = containers.filter(c => c.Labels && LABEL_INFERENCE_SERVER in c.Labels);

    // clean existing disposables
    this.cleanDisposables();
    this.#servers = new Map<string, InferenceServerInstance<PodmanInferenceDetails>>(
      filtered.map(containerInfo => {
        let modelInfos: ModelInfo[] = [];
        try {
          const modelIds: string[] = JSON.parse(containerInfo.Labels[LABEL_INFERENCE_SERVER]);
          modelInfos = modelIds
            .filter(id => this.modelsManager.isModelOnDisk(id))
            .map(id => this.modelsManager.getModelInfo(id));
        } catch (err: unknown) {
          console.error('Something went wrong while getting the models ids from the label.', err);
        }

        return [
          containerInfo.Id,
          {
            id: containerInfo.Id,
            details: {
              containerId: containerInfo.Id,
              engineId: containerInfo.engineId,
            },
            connection: {
              host: 'localhost',
              port: !!containerInfo.Ports && containerInfo.Ports.length > 0 ? containerInfo.Ports[0].PublicPort : -1,
            },
            status: containerInfo.Status === 'running' ? 'running' : 'stopped',
            models: modelInfos,
            runtime: RuntimeType.PODMAN,
            type: getInferenceType(modelInfos),
            stop: this.stopInferenceServer.bind(this, containerInfo.Id),
            start: this.startInferenceServer.bind(this, containerInfo.Id),
            remove: this.deleteInferenceServer.bind(this, containerInfo.Id),
            navigate: () => podmanDesktopApi.navigation.navigateToContainer(containerInfo.Id),
          },
        ];
      }),
    );

    // (re-)create container watchers
    this.#servers.forEach(server => this.watchContainerStatus(server.details.engineId, server.details.containerId));
    this.#initialized = true;
    // notify update
    this.notify();
  }

  /**
   * Remove the reference of the inference server
   * /!\ Does not delete the corresponding container
   * @param containerId
   */
  private removeInferenceServer(containerId: string): void {
    this.#servers.delete(containerId);
    this.notify();
  }

  /**
   * Delete the InferenceServerInfo instance from #servers and matching container
   * @param containerId the id of the container running the Inference Server
   */
  async deleteInferenceServer(containerId: string): Promise<void> {
    const server = this.#servers.get(containerId);
    if (!server) {
      throw new Error(`cannot find a corresponding server for container id ${containerId}.`);
    }

    try {
      // Set status a deleting
      this.setInferenceServerStatus(server.details.containerId, 'deleting');

      // If the server is running we need to stop it.
      if (server.status === 'running') {
        await containerEngine.stopContainer(server.details.engineId, server.details.containerId);
      }

      // Delete the container
      await containerEngine.deleteContainer(server.details.engineId, server.details.containerId);

      // Delete the reference
      this.removeInferenceServer(containerId);
    } catch (err: unknown) {
      console.error('Something went wrong while trying to delete the inference server.', err);
      this.setInferenceServerStatus(server.details.containerId, 'error');
      this.retryableRefresh(2);
    }
  }

  /**
   * Start an inference server from the container id
   * @param containerId the identifier of the container to start
   */
  async startInferenceServer(containerId: string): Promise<void> {
    if (!this.isInitialize()) throw new Error('Cannot start the inference server.');

    const server = this.#servers.get(containerId);
    if (server === undefined) throw new Error(`cannot find a corresponding server for container id ${containerId}.`);

    try {
      // set status to starting
      this.setInferenceServerStatus(server.details.containerId, 'starting');
      await containerEngine.startContainer(server.details.engineId, server.details.containerId);

      this.setInferenceServerStatus(server.details.containerId, 'running');
      // start watch for container status update
      this.watchContainerStatus(server.details.engineId, server.details.containerId);
    } catch (error: unknown) {
      console.error(error);
      this.telemetry.logError('inference.start', {
        message: 'error starting inference',
        error: error,
      });
      this.setInferenceServerStatus(server.details.containerId, 'error');
      this.retryableRefresh(1);
    }
  }

  /**
   * Stop an inference server from the container id
   * @param containerId the identifier of the container to stop
   */
  async stopInferenceServer(containerId: string): Promise<void> {
    if (!this.isInitialize()) throw new Error('Cannot stop the inference server.');

    const server = this.#servers.get(containerId);
    if (server === undefined) throw new Error(`cannot find a corresponding server for container id ${containerId}.`);

    if (isTransitioning(server)) throw new Error(`cannot stop a transitioning server.`);

    try {
      // set server to stopping
      this.setInferenceServerStatus(server.details.containerId, 'stopping');

      await containerEngine.stopContainer(server.details.engineId, server.details.containerId);
      // once stopped update the status
      this.setInferenceServerStatus(server.details.containerId, 'stopped');
    } catch (error: unknown) {
      console.error(error);
      this.telemetry.logError('inference.stop', {
        message: 'error stopping inference',
        error: error,
      });

      this.setInferenceServerStatus(server.details.containerId, 'error');
      this.retryableRefresh(1);
    }
  }

  /**
   * Given an containerId, set the status of the corresponding inference server
   * @param containerId
   * @param status
   */
  private setInferenceServerStatus(containerId: string, status: InferenceServerStatus): void {
    const server = this.#servers.get(containerId);
    if (server === undefined) throw new Error(`cannot find a corresponding server for container id ${containerId}.`);

    this.#servers.set(server.details.containerId, {
      ...server,
      status: status,
      health: undefined, // always reset health history when changing status
    });
    this.notify();
  }
}