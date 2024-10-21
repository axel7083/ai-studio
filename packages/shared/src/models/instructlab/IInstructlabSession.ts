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
import type { ContainerProviderConnectionInfo } from '../IContainerConnectionInfo';

export enum InstructLabState {
  INITIALIZED = 'initialized',
  SETUP_GENERATE = 'setup-generate',
  GENERATING = 'generating',
  GENERATING_COMPLETED = 'generating-completed',
  SETUP_FINE_TUNE = 'setup-fine-tune',
  FINE_TUNING = 'fine-tuning',
  TRAINING_COMPLETED = 'training-completed',
}

export enum TRAINING {
  SKILLS = 'skills',
  KNOWLEDGE = 'knowledge',
}

export interface InstructlabContainer {
  // connection of the container
  connection: {
    engineId: string;
    containerId: string;
  }
}

export interface InstructlabSession {
  // unique identifier
  uid: string;

  // connection to use
  connection?: ContainerProviderConnectionInfo;

  // container image to use
  baseImage: string;

  // session name
  name: string;

  // models
  teacherModelId: string;
  targetModel: string;

  // taxonomy
  repository: string;

  // timestamp
  createdTime: number;

  training: TRAINING,

  state: InstructLabState;
  /**
   * Labels to propagate
   */
  labels: { [id: string]: string };

  /**
   * during the instructlab process several containers will be used (generating dataset, training)
   */
  containers: InstructlabContainer[];
}

export interface InstructLabSessionConfig {
  /**
   * The connection info to use
   */
  connection?: ContainerProviderConnectionInfo;

  repository?: string;

  name: string;
  training: TRAINING,
  files: string[];
  /**
   * Model that will be used to generate the synthetic data
   */
  teacherModelId: string;
  /**
   * Model that will be fine-tuned (must be hugging face repository)
   */
  targetModel: string;
  /**
   * Labels to propagate
   */
  labels: { [id: string]: string };
}

export interface InstructLabSessions {
  version: '1.0',
  sessions: InstructlabSession[];
}

