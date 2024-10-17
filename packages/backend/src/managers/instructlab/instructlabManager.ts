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

export const ILAB_IMAGE = 'localhost/ilab:0.19.3-1729081109';

export const ILAB_LABEL = 'instructlab';

export class InstructlabManager implements Disposable {
  constructor(
    private appUserDirectory: string,
    private modelsManager: ModelsManager,
    private podman: PodmanConnection,
    private inferenceManager: InferenceManager,
    private git: GitManager,
    private taskRegistry: TaskRegistry,
    private sessionsRegistry: InstructLabRegistry,
  ) {}

  public dispose(): void {}

  protected getSessionDirectory(session: InstructlabSession): string {
    return join(this.appUserDirectory, 'instructlab', session.uid);
  }

  protected getSessionRepositoryDirectory(session: InstructlabSession): string {
    return join(this.getSessionDirectory(session), 'taxonomy');
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

  protected async initSession(session: InstructlabSession): Promise<void> {
    // ensure the directory exist
    await mkdir(this.getSessionDatasetDirectory(session), { recursive: true });
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
      instructModelId: config.instructModelId,
      targetModelId: config.targetModelId,
      state: InstructLabState.INITIALIZED,
      labels: config.labels,
      training: config.training,
      baseImage: ILAB_IMAGE,
    };

    // init configuration
    console.log('init session (create folders)');
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
    this.sessionsRegistry.setState(uid, InstructLabState.GENERATING);
    const session = this.sessionsRegistry.get(uid);

    // Get the instruct model
    const instructModelInfo: ModelInfo = this.modelsManager.getModelInfo(session.instructModelId);

    // get an inference server with our instruct model
    const serverTask = this.taskRegistry.createTask(`Starting an inference server`, 'loading', session.labels);
    const server: InferenceServer = await this.startInstructInferenceServer(session.connection, instructModelInfo);
    this.taskRegistry.updateTask({...serverTask, state: 'success'});

    // start the generate task
    const generateTask = this.taskRegistry.createTask(`Generating dataset`, 'loading', session.labels);
    await this.startGenerate(session, server);
    this.taskRegistry.updateTask({...generateTask, state: 'success'});
  }

  protected async startGenerate(session: InstructlabSession, server: InferenceServer): Promise<ContainerCreateResult > {
    let connection: ContainerProviderConnection | undefined;
    if(session.connection) {
      connection = this.podman.getContainerProviderConnection(session.connection);
    }

    const images = await containerEngine.listImages({
      provider: connection,
    });
    const image = images.find(image => image.RepoTags?.[0] === session.baseImage);
    if(!image) throw new Error(`cannot found corresponding image to ${session.baseImage}`);

    return containerEngine.createContainer(image.engineId, {
      name: `${session.name}-generate`,
      Image: image.Id,
      Labels: {
        ...session.labels,
        [ILAB_LABEL]: 'generate',
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
            Target: '/opt/app/root/src/.config/instructlab/config.yaml',
            Source: this.getSessionConfigurationPath(session),
            Type: 'bind',
          }],
      },
      Cmd: ['generate', `--endpoint-url=http://host.containers.internal:${server.connection.port}`],
    });
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
