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

import { env, version } from '@podman-desktop/api';
import { satisfies, minVersion, coerce } from 'semver';
import type {
  ExtensionContext,
  TelemetryLogger,
  WebviewPanel,
  WebviewPanelOnDidChangeViewStateEvent,
} from '@podman-desktop/api';
import { RpcExtension } from '@shared/src/messages/MessageProxy';
import { StudioApiImpl } from './studio-api-impl';
import { PodmanApplicationManager } from './managers/applications/podmanApplicationManager';
import { GitManager } from './managers/gitManager';
import { TaskRegistry } from './registries/TaskRegistry';
import { CatalogManager } from './managers/catalogManager';
import { ModelsManager } from './managers/modelsManager';
import { ContainerRegistry } from './registries/ContainerRegistry';
import { PodmanConnection } from './managers/podmanConnection';
import { LocalRepositoryRegistry } from './registries/LocalRepositoryRegistry';
import { PodmanInferenceManager } from './managers/inference/podmanInferenceManager';
import { PlaygroundV2Manager } from './managers/playgroundV2Manager';
import { SnippetManager } from './managers/SnippetManager';
import { CancellationTokenRegistry } from './registries/CancellationTokenRegistry';
import { engines } from '../package.json';
import { BuilderManager } from './managers/recipes/BuilderManager';
import { PodManager } from './managers/recipes/PodManager';
import { initWebview } from './webviewUtils';
import { PodmanLlamaCppPython } from './workers/provider/inference/PodmanLlamaCppPython';
import { InferenceProviderRegistry } from './registries/InferenceProviderRegistry';
import { InferenceServerRegistry } from './registries/InferenceServerRegistry';
import { KubernetesInferenceManager } from './managers/inference/kubernetesInferenceManager';
import { KubernetesLlamaCppPython } from './workers/provider/inference/KubernetesLlamaCppPython';
import { ConfigurationRegistry } from './registries/ConfigurationRegistry';
import { RecipeManager } from './managers/recipes/RecipeManager';
import { PodmanApplicationProvider } from './workers/provider/application/PodmanApplicationProvider';
import { ApplicationEngineRegistry } from './registries/ApplicationEngineRegistry';
import { KubernetesApplicationProvider } from './workers/provider/application/KubernetesApplicationProvider';
import { KubernetesApplicationManager } from './managers/applications/kubernetesApplicationManager';
import { KubernetesPodRegistry } from './registries/KubernetesPodRegistry';

export class Studio {
  readonly #extensionContext: ExtensionContext;

  /**
   * Webview panel used by AI Lab
   */
  #panel: WebviewPanel | undefined;

  /**
   * API related classes
   */
  #rpcExtension: RpcExtension | undefined;
  #studioApi: StudioApiImpl | undefined;

  #localRepositoryRegistry: LocalRepositoryRegistry | undefined;
  #catalogManager: CatalogManager | undefined;
  #modelsManager: ModelsManager | undefined;
  #telemetry: TelemetryLogger | undefined;
  // our runtime inference managers
  #podmanInferenceManager: PodmanInferenceManager | undefined;
  #kubernetesInferenceManager: KubernetesInferenceManager | undefined;

  #inferenceServerRegistry: InferenceServerRegistry | undefined;
  #podManager: PodManager | undefined;
  #builderManager: BuilderManager | undefined;
  #containerRegistry: ContainerRegistry | undefined;
  #podmanConnection: PodmanConnection | undefined;
  #taskRegistry: TaskRegistry | undefined;
  #cancellationTokenRegistry: CancellationTokenRegistry | undefined;
  #snippetManager: SnippetManager | undefined;
  #playgroundManager: PlaygroundV2Manager | undefined;
  #configurationRegistry: ConfigurationRegistry | undefined;

  #recipeManager: RecipeManager | undefined;
  // application engines
  #podmanApplicationManager: PodmanApplicationManager | undefined;
  #kubernetesApplicationManager: KubernetesApplicationManager | undefined;

  // application providers
  #podmanApplicationProvider: PodmanApplicationProvider | undefined;
  #kubernetesApplicationProvider: KubernetesApplicationProvider | undefined;

  #applicationEngineRegistry: ApplicationEngineRegistry | undefined;
  #inferenceProviderRegistry: InferenceProviderRegistry | undefined;

  #kubernetesPodRegistry: KubernetesPodRegistry | undefined;

  constructor(readonly extensionContext: ExtensionContext) {
    this.#extensionContext = extensionContext;
  }

  private checkVersion(): boolean {
    if (!version) return false;

    const current = coerce(version);
    if (!current) return false;

    return satisfies(current, engines['podman-desktop']);
  }

  public async activate(): Promise<void> {
    console.log('starting AI Lab extension');
    this.#telemetry = env.createTelemetryLogger();

    /**
     * Ensure the running version of podman is compatible with
     * our minimum requirement
     */
    if (!this.checkVersion()) {
      const min = minVersion(engines['podman-desktop']) ?? { version: 'unknown' };
      const current = version ?? 'unknown';
      this.#telemetry.logError('start.incompatible', {
        version: current,
        message: `error activating extension on version below ${min.version}`,
      });
      throw new Error(
        `Extension is not compatible with Podman Desktop version below ${min.version}. Current ${current}`,
      );
    }

    /**
     * Storage directory for the extension provided by podman desktop
     */
    const appUserDirectory = this.extensionContext.storagePath;

    this.#telemetry.logUsage('start');

    /**
     * The AI Lab has a webview integrated in Podman Desktop
     * We need to initialize and configure it properly
     */
    this.#panel = await initWebview(this.#extensionContext.extensionUri);
    this.#extensionContext.subscriptions.push(this.#panel);
    this.#panel.onDidChangeViewState((e: WebviewPanelOnDidChangeViewStateEvent) => {
      this.#telemetry?.logUsage(e.webviewPanel.visible ? 'opened' : 'closed');
    });

    /**
     * Cancellation token registry store the tokens used to cancel a task
     */
    this.#cancellationTokenRegistry = new CancellationTokenRegistry();
    this.#extensionContext.subscriptions.push(this.#cancellationTokenRegistry);

    /**
     * The configuration registry manage the extension preferences/settings
     */
    this.#configurationRegistry = new ConfigurationRegistry(this.#panel.webview, appUserDirectory);
    this.#configurationRegistry?.init();
    this.#extensionContext.subscriptions.push(this.#configurationRegistry);

    /**
     * The container registry handle the events linked to containers (start, remove, die...)
     */
    this.#containerRegistry = new ContainerRegistry();
    this.#containerRegistry.init();
    this.#extensionContext.subscriptions.push(this.#containerRegistry);

    /**
     * The RpcExtension handle the communication channels between the frontend and the backend
     */
    this.#rpcExtension = new RpcExtension(this.#panel.webview);
    this.#rpcExtension.init();
    this.#extensionContext.subscriptions.push(this.#rpcExtension);

    /**
     * GitManager is used for cloning, pulling etc. recipes repositories
     */
    const gitManager = new GitManager();

    /**
     * The podman connection class is responsible for podman machine events (start/stop)
     */
    this.#podmanConnection = new PodmanConnection();
    this.#podmanConnection.init();
    this.#extensionContext.subscriptions.push(this.#podmanConnection);

    /**
     * The task registry store the tasks
     */
    this.#taskRegistry = new TaskRegistry(this.#panel.webview);

    /**
     * Create catalog manager, responsible for loading the catalog files and watching for changes
     */
    this.#catalogManager = new CatalogManager(this.#panel.webview, appUserDirectory);
    this.#catalogManager.init();

    /**
     * The builder manager is handling the building tasks, create corresponding tasks
     * through the task registry and cancellation.
     */
    this.#builderManager = new BuilderManager(this.#taskRegistry);
    this.#extensionContext.subscriptions.push(this.#builderManager);

    /**
     * The pod manager is a class responsible for managing the Pods
     */
    this.#podManager = new PodManager();
    this.#podManager.init();
    this.#extensionContext.subscriptions.push(this.#podManager);

    /**
     * The ModelManager role is to download and
     */
    this.#modelsManager = new ModelsManager(
      this.#configurationRegistry.getExtensionConfiguration().modelsPath,
      this.#panel.webview,
      this.#catalogManager,
      this.#telemetry,
      this.#taskRegistry,
      this.#cancellationTokenRegistry,
    );
    this.#modelsManager.init();
    this.#extensionContext.subscriptions.push(this.#modelsManager);

    /**
     * The LocalRepositoryRegistry store and watch for recipes repository locally and expose it.
     */
    this.#localRepositoryRegistry = new LocalRepositoryRegistry(
      this.#panel.webview,
      appUserDirectory,
      this.#catalogManager,
    );
    this.#localRepositoryRegistry.init();
    this.#extensionContext.subscriptions.push(this.#localRepositoryRegistry);

    /**
     * The recipe manager is responsible for the operation on recipes (E.g. clone, build.)
     */
    this.#recipeManager = new RecipeManager(
      this.#panel.webview,
      appUserDirectory,
      gitManager,
      this.#taskRegistry,
      this.#builderManager,
      this.#localRepositoryRegistry,
    );
    this.#recipeManager.init();
    this.#extensionContext.subscriptions.push(this.#recipeManager);

    /**
     * The application engine registry hold the application engines
     */
    this.#applicationEngineRegistry = new ApplicationEngineRegistry(this.#panel.webview);
    this.#extensionContext.subscriptions.push(this.#applicationEngineRegistry);

    /**
     * The Inference Provider registry stores all the InferenceProvider (aka backend) which
     * can be used to create InferenceServers
     */
    this.#inferenceProviderRegistry = new InferenceProviderRegistry(this.#panel.webview);

    /**
     * Responsible for deploying recipes to kubernetes environment
     */
    this.#kubernetesApplicationProvider = new KubernetesApplicationProvider(this.#taskRegistry, this.#inferenceProviderRegistry);
    this.#extensionContext.subscriptions.push(this.#kubernetesApplicationProvider);

    /**
     * Responsible for deploying recipes to podman environment
     */
    this.#podmanApplicationProvider = new PodmanApplicationProvider(
      this.#podManager,
      this.#taskRegistry,
    );
    this.#extensionContext.subscriptions.push(this.#podmanApplicationProvider);

    /**
     * Informer for kubernetes pods
     */
    this.#kubernetesPodRegistry = new KubernetesPodRegistry();
    this.#kubernetesPodRegistry.init();
    this.#extensionContext.subscriptions.push(this.#kubernetesPodRegistry);


    /**
     *  The KubernetesApplicationManager create, watch, manage the application pods deployed on kubernetes engine
     */
    this.#kubernetesApplicationManager = new KubernetesApplicationManager(
      this.#kubernetesApplicationProvider,
      this.#taskRegistry,
      this.#catalogManager,
      this.#recipeManager,
      this.#configurationRegistry,
      this.#kubernetesPodRegistry,
    );
    this.#kubernetesApplicationManager.init();
    this.#extensionContext.subscriptions.push(this.#kubernetesApplicationManager);
    this.#applicationEngineRegistry.register(this.#kubernetesApplicationManager);

    /**
     *  The PodmanApplicationProvider create, watch, manage the application pods deployed on podman engine
     */
    this.#podmanApplicationManager = new PodmanApplicationManager(
      this.#taskRegistry,
      this.#podmanConnection,
      this.#catalogManager,
      this.#modelsManager,
      this.#telemetry,
      this.#podManager,
      this.#recipeManager,
      this.#podmanApplicationProvider,
      this.#configurationRegistry,
    );
    this.#podmanApplicationManager.init();
    this.#extensionContext.subscriptions.push(this.#podmanApplicationManager);
    this.#applicationEngineRegistry.register(this.#podmanApplicationManager);

    this.#extensionContext.subscriptions.push(
      this.#inferenceProviderRegistry.register(new PodmanLlamaCppPython(this.#taskRegistry)),
    );
    this.#extensionContext.subscriptions.push(
      this.#inferenceProviderRegistry.register(new KubernetesLlamaCppPython(this.#taskRegistry)),
    );

    /**
     * The PodmanInferenceManager create, stop, manage Inference servers on podman machines
     */
    this.#podmanInferenceManager = new PodmanInferenceManager(
      this.#containerRegistry,
      this.#podmanConnection,
      this.#modelsManager,
      this.#telemetry,
      this.#taskRegistry,
      this.#inferenceProviderRegistry,
      this.#catalogManager,
    );
    this.#podmanInferenceManager.init();
    this.#extensionContext.subscriptions.push(this.#podmanInferenceManager);

    /**
     * KubernetesInferenceManager
     */
    this.#kubernetesInferenceManager = new KubernetesInferenceManager(
      this.#taskRegistry,
      this.#modelsManager,
      this.#inferenceProviderRegistry,
      this.#kubernetesPodRegistry,
    );
    this.#kubernetesInferenceManager.init();
    this.#extensionContext.subscriptions.push(this.#kubernetesInferenceManager);

    /**
     * The inference server registry hold the runtime inference manager (E.g. PodmanInferenceManager)
     */
    this.#inferenceServerRegistry = new InferenceServerRegistry(this.#panel.webview);
    // register podman inference manager
    this.#extensionContext.subscriptions.push(this.#inferenceServerRegistry.register(this.#podmanInferenceManager));
    // register kubernetes inference manager
    this.#extensionContext.subscriptions.push(this.#inferenceServerRegistry.register(this.#kubernetesInferenceManager));

    /**
     * PlaygroundV2Manager handle the conversations of the Playground by using the InferenceServerInfo available
     */
    this.#playgroundManager = new PlaygroundV2Manager(
      this.#panel.webview,
      this.#podmanInferenceManager,
      this.#taskRegistry,
      this.#telemetry,
    );
    this.#extensionContext.subscriptions.push(this.#playgroundManager);

    /**
     * The snippet manager provide code snippet used in the
     * InferenceServerInfo details page
     */
    this.#snippetManager = new SnippetManager(this.#panel.webview, this.#telemetry);
    this.#snippetManager.init();

    /**
     * The StudioApiImpl is the implementation of our API between backend and frontend
     */
    this.#studioApi = new StudioApiImpl(
      this.#applicationEngineRegistry,
      this.#catalogManager,
      this.#modelsManager,
      this.#telemetry,
      this.#localRepositoryRegistry,
      this.#taskRegistry,
      this.#inferenceServerRegistry,
      this.#playgroundManager,
      this.#snippetManager,
      this.#cancellationTokenRegistry,
      this.#recipeManager,
      this.#configurationRegistry,
    );
    // Register the instance
    this.#rpcExtension.registerInstance<StudioApiImpl>(StudioApiImpl, this.#studioApi);
  }

  public async deactivate(): Promise<void> {
    console.log('stopping AI Lab extension');
    this.#telemetry?.logUsage('stop');
  }
}
