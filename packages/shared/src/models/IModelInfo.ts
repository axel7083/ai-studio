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

import type { LocalModelInfo } from './ILocalModelInfo';

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  registry?: string;
  license?: string;
  url?: string;
  file?: LocalModelInfo;
  state?: 'deleting';
  memory?: number;
  properties?: {
    [key: string]: string;
  };
  sha256?: string;
  /**
   * The backend field aims to target which inference
   * server the model requires
   */
  backend?: string;
}

export type ModelCheckerContext = 'inference' | 'recipe';
