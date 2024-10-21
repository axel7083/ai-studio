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

import type {
  InstructlabSession,
  InstructLabSessionConfig} from '@shared/src/models/instructlab/IInstructlabSession';
import {
  InstructLabState,
  TRAINING,
} from '@shared/src/models/instructlab/IInstructlabSession';
import type { ContainerCreateResult, ContainerProviderConnection, Disposable } from '@podman-desktop/api';
import { containerEngine } from '@podman-desktop/api';
import type { InferenceManager } from '../inference/inferenceManager';
import type { ModelsManager } from '../modelsManager';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import type { InferenceServer } from '@shared/src/models/IInference';
import { withDefaultConfiguration } from '../../utils/inferenceUtils';
import type { ContainerProviderConnectionInfo } from '@shared/src/models/IContainerConnectionInfo';
import type { PodmanConnection } from '../podmanConnection';
import type { GitManager } from '../gitManager';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getRandomString } from '../../utils/randomUtils';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import ilabBaseConfig from '../../assets/instructlab-base-config.yaml?raw';
import { DISABLE_SELINUX_LABEL_SECURITY_OPTION } from '../../utils/utils';
import type { InstructLabRegistry } from '../../registries/instructlab/InstructLabRegistry';
import type { ContainerRegistry } from '../../registries/ContainerRegistry';

export const ILAB_IMAGE = 'localhost/ilab:cpu-1729507671';

export const ILAB_LABEL = 'instructlab';
export const ILAB_INFERENCE = 'instructlab-inference';

export class InstructlabManager implements Disposable {

  #containersEvent: Disposable | undefined;

  constructor(
    private appUserDirectory: string,
    private modelsManager: ModelsManager,
    private podman: PodmanConnection,
    private inferenceManager: InferenceManager,
    private git: GitManager,
    private taskRegistry: TaskRegistry,
    private sessionsRegistry: InstructLabRegistry,
    private containers: ContainerRegistry,
  ) {}

  public dispose(): void {
    this.#containersEvent?.dispose();
  }

  public init(): void {
    this.#containersEvent = this.containers.onDieContainerEvent(async ({ id }) => {
      const sessions = this.sessionsRegistry.getSessions();
      const session = sessions.find(session => session.containers.some(container => container.connection.containerId = id));
      if(!session) return;

      const container = session.containers.find(container => container.connection.containerId = id);
      if(!container) throw new Error('missing container in session containers');

      const exitCode = await this.getContainerExitCode(container.connection.engineId, container.connection.containerId);

      if(exitCode !== 0) {
        // container failed
        switch (session.state) {
          case InstructLabState.GENERATING:
            // restore previous state as generating failed
            this.sessionsRegistry.setState(session.uid, InstructLabState.INITIALIZED);
            break;
          case InstructLabState.FINE_TUNING:
            // restore previous state as generating failed
            this.sessionsRegistry.setState(session.uid, InstructLabState.GENERATING_COMPLETED);
            break;
        }
      } else {
        // success
        switch (session.state) {
          case InstructLabState.GENERATING:
            // restore previous state as generating failed
            this.sessionsRegistry.setState(session.uid, InstructLabState.GENERATING_COMPLETED);
            break;
          case InstructLabState.FINE_TUNING:
            // restore previous state as generating failed
            this.sessionsRegistry.setState(session.uid, InstructLabState.TRAINING_COMPLETED);
            break;
        }
      }
    });
  }

  protected async getContainerExitCode(engineId: string, containerId: string): Promise<number> {
    try {
      // the container might already be removed when we try to inspect it
      const result = await containerEngine.inspectContainer(engineId, containerId);
      if(result.State.Status !== 'exited') return -1;
      return result.State.ExitCode ?? -1;
    } catch (err: unknown) {
      console.error(err);
      return -1;
    }
  }

  public getSessionDirectory(session: InstructlabSession): string {
    return join(this.appUserDirectory, 'instructlab', session.uid);
  }

  protected getSessionRepositoryDirectory(session: InstructlabSession): string {
    return join(this.getSessionDirectory(session), 'taxonomy');
  }

  protected getSessionCheckpointsDirectory(session: InstructlabSession): string {
    return join(this.getSessionDirectory(session), 'checkpoints');
  }

  protected getSessionDatasetDirectory(session: InstructlabSession): string {
    return join(this.getSessionDirectory(session), 'datasets');
  }

  protected getSessionConfigurationPath(session: InstructlabSession): string {
    return join(this.getSessionDirectory(session), 'config.yaml');
  }

  public async requestNewSession(config: InstructLabSessionConfig): Promise<string> {
    // create a tracking id to put in the labels
    const trackingId: string = getRandomString();

    config.labels = {
      ...config.labels,
      trackingId: trackingId,
    };

    const task = this.taskRegistry.createTask('Creating InstructLab session', 'loading', {
      trackingId: trackingId,
    });

    // call new session but do not wait for completion
    this.newSession(config).then((session) => {
      console.log('new session comppleted');
      this.taskRegistry.updateTask({
        ...task,
        state: 'success',
        labels: {
          ...task.labels,
          sessionId: session.uid,
        },
      });
    }).catch((err: unknown) => {
      console.log('Something went wrong while creating new session', err);
      // Get all tasks using the tracker
      const tasks = this.taskRegistry.getTasksByLabels({
        trackingId: trackingId,
      });
      // Filter the one no in loading state
      tasks
        .filter(t => t.state === 'loading')
        .forEach(t => {
          this.taskRegistry.updateTask({
            ...t,
            state: 'error',
            error: String(err),
          });
        });
    });

    return trackingId;
  }

  public async abortSession(uid: string): Promise<void> {
    const session = this.sessionsRegistry.get(uid);

    try {
      await Promise.allSettled(
        (session.containers ?? []).map(container => containerEngine.stopContainer(
            container.connection.engineId,
            container.connection.containerId,
          ),
        ),
      );
    } catch (err: unknown) {
      console.error('Something went wrong while trying to stop all session container', err);
    } finally {
       // restore previous state if needed
       switch (session.state) {
         case InstructLabState.SETUP_GENERATE:
         case InstructLabState.GENERATING:
           this.sessionsRegistry.setState(uid, InstructLabState.INITIALIZED);
           break;
         case InstructLabState.SETUP_FINE_TUNE:
         case InstructLabState.FINE_TUNING:
           this.sessionsRegistry.setState(uid, InstructLabState.GENERATING_COMPLETED);
           break;
         default:
           break;
       }
    }
  }

  protected async initSession(session: InstructlabSession): Promise<void> {
    // ensure the directory exist
    await mkdir(this.getSessionDatasetDirectory(session), { recursive: true });
    await mkdir(this.getSessionCheckpointsDirectory(session), { recursive: true });

    // get the configuration path
    const path = this.getSessionConfigurationPath(session);
    // write content
    return writeFile(path, ilabBaseConfig);
  }

  public async newSession(config: InstructLabSessionConfig): Promise<InstructlabSession> {
    const session: InstructlabSession = {
      name: config.name,
      uid: randomUUID(),
      createdTime: new Date().getTime(),
      repository: config.repository ?? 'https://github.com/instructlab/taxonomy',
      teacherModelId: config.teacherModelId,
      targetModel: config.targetModel,
      state: InstructLabState.INITIALIZED,
      labels: config.labels,
      training: config.training,
      baseImage: ILAB_IMAGE,
      containers: [],
    };

    // init configuration
    await this.initSession(session);

    const cloneTask = this.taskRegistry.createTask(`Cloning ${session.repository}`, 'loading', config.labels);

    // clone the repository
    await this.git.cloneRepository({
      repository: session.repository,
      targetDirectory: this.getSessionRepositoryDirectory(session),
    });
    this.taskRegistry.updateTask({ ...cloneTask, state: 'success' });

    const populateTask = this.taskRegistry.createTask(`Populate taxonomy `, 'loading', config.labels);
    await this.populateSession(session, config.files);
    this.taskRegistry.updateTask({ ...populateTask, state: 'success' });

    // register the session
    this.sessionsRegistry.register(session);

    return session;
  }

  protected async populateSession(session: InstructlabSession, files: string[]): Promise<void> {
    if(!files || files.length === 0) throw new Error('cannot populate session without any files');

    const repository = this.getSessionRepositoryDirectory(session);
    if(session.training !== TRAINING.KNOWLEDGE) throw new Error('skills not supported yet');

    const miscellaneous = join(repository, 'knowledge', 'miscellaneous_unknown');
    for (let i = 0; i < files.length; i++) {
      const targetDir = join(miscellaneous, `unknown-${i}`);
      await mkdir(targetDir, { recursive: true });
      await copyFile(files[i], join(targetDir, 'qna.yaml'));
    }
  }

  public async requestGenerate(uid: string): Promise<void> {
    this.sessionsRegistry.setState(uid, InstructLabState.SETUP_GENERATE);
    const session = this.sessionsRegistry.get(uid);

    // Get the instruct model
    const instructModelInfo: ModelInfo = this.modelsManager.getModelInfo(session.teacherModelId);

    // get an inference server with our instruct model
    const serverTask = this.taskRegistry.createTask(`Starting an inference server`, 'loading', session.labels);
    const server: InferenceServer = await this.startInstructInferenceServer(session.connection, instructModelInfo);
    this.taskRegistry.updateTask({...serverTask, state: 'success'});

    // start the generate task
    this.sessionsRegistry.setState(uid, InstructLabState.GENERATING);
    const generateTask = this.taskRegistry.createTask(`Start generating container`, 'loading', session.labels);

    try {
      await this.startGenerate(session, server);
      this.taskRegistry.updateTask({...generateTask, state: 'success'});
    } catch (err: unknown) {
      this.taskRegistry.updateTask({...generateTask, state: 'error', error: `Something went wrong while starting generate task: ${err}`});
      // aborting to ensure state is not problematic
      this.abortSession(uid).catch((err: unknown) => {
        console.error('Something went wrong while trying to abort', err);
      });
      throw err;
    }
  }

  protected async startGenerate(session: InstructlabSession, server: InferenceServer): Promise<ContainerCreateResult > {
    let connection: ContainerProviderConnection | undefined;
    if(session.connection) {
      connection = this.podman.getContainerProviderConnection(session.connection);
    }

    const images = await containerEngine.listImages({
      provider: connection,
    });
    const image = images.find(image => image.RepoTags?.some((tag) => tag === session.baseImage));
    if(!image) throw new Error(`cannot found corresponding image to ${session.baseImage}`);

    const result = await containerEngine.createContainer(image.engineId, {
      name: `${session.name}-generate`,
      Image: image.Id,
      Labels: {
        ...session.labels,
        [ILAB_LABEL]: 'generate',
        [ILAB_INFERENCE]: server.container.containerId,
      },
      Detach: true,
      HostConfig: {
        SecurityOpt: [DISABLE_SELINUX_LABEL_SECURITY_OPTION],
        Mounts: [
          {
            Target: '/mnt/taxonomy',
            Source: this.getSessionRepositoryDirectory(session),
            Type: 'bind',
          },
          {
            Target: '/mnt/dataset',
            Source: this.getSessionDatasetDirectory(session),
            Type: 'bind',
          },
          {
            Target: '/opt/app-root/src/.config/instructlab/config.yaml',
            Source: this.getSessionConfigurationPath(session),
            Type: 'bind',
            ReadOnly: true,
          }],
      },
      Cmd: [
        'generate',
        // use the endpoint of our inference server
        `--endpoint-url=http://host.containers.internal:${server.connection.port}/v1`,
        // taxonomy path should be the mounted taxonomy path
        '--taxonomy-path=/mnt/taxonomy',
        // output dir should be the mounted dataset path
        '--output-dir=/mnt/dataset',
      ],
    });
    // register the container to the session
    this.sessionsRegistry.registerContainer(session.uid, {
      connection: {
        engineId: result.engineId,
        containerId: result.id,
      },
    });

    return result;
  }

  /**
   * This method will start an inference server with the model provided.
   * If an existing server exists, it will use it
   * @param connection the connection to use
   * @param model
   * @protected
   */
  protected async startInstructInferenceServer(connection: ContainerProviderConnectionInfo | undefined, model: ModelInfo): Promise<InferenceServer> {
    let engineId: string | undefined;
    if(connection) {
      engineId = await this.podman.getEngineId(
        this.podman.getContainerProviderConnection(connection),
      );
    }

    let server: InferenceServer | undefined = this.inferenceManager.findServerByModel(model, engineId);
    // if an existing server exists using it
    if(server) {
      // if stopped start it
      if(server.status === 'stopped') {
        await this.inferenceManager.startInferenceServer(server.container.containerId);
      }

      return server;
    }

    // otherwise create one
    const config = await withDefaultConfiguration({
      connection: connection,
      modelsInfo: [model],
    });
    const serverId = await this.inferenceManager.createInferenceServer(config);
    server = this.inferenceManager.get(serverId);
    if(!server) throw new Error(`Something went wrong while trying to get inference server with id ${serverId}`);
    return server;
  }
}
