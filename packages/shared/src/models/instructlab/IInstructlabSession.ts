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
  GENERATING = 'generating',
  FINE_TUNING = 'fine-tuning',
  COMPLETED = 'completed',
}

export enum TRAINING {
  SKILLS = 'skills',
  KNOWLEDGE = 'knowledge',
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
  instructModelId: string;
  targetModelId: string;

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
  instructModelId: string;
  /**
   * Model that will be fine-tuned
   */
  targetModelId: string;
  /**
   * Labels to propagate
   */
  labels: { [id: string]: string };
}
