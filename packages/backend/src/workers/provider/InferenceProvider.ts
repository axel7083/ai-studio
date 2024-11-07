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
import type { Disposable } from '@podman-desktop/api';
import type { InferenceServerConfig } from '@shared/src/models/InferenceServerConfig';
import type { IWorker } from '../IWorker';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import type { InferenceServer, InferenceType } from '@shared/src/models/IInference';
import { ContainerProvider } from './ContainerProvider';

export abstract class InferenceProvider
  extends ContainerProvider
  implements IWorker<InferenceServerConfig, InferenceServer>, Disposable
{
  readonly type: InferenceType;
  readonly name: string;

  protected constructor(taskRegistry: TaskRegistry, type: InferenceType, name: string) {
    super(taskRegistry);
    this.type = type;
    this.name = name;
  }

  abstract enabled(): boolean;
  abstract perform(config: InferenceServerConfig): Promise<InferenceServer>;
  abstract dispose(): void;
}
