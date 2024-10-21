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

import type { InstructlabAPI } from '@shared/src/InstructlabAPI';
import type { InstructlabManager } from './managers/instructlab/instructlabManager';
import type { InstructlabSession, InstructLabSessionConfig } from '@shared/src/models/instructlab/IInstructlabSession';
import type { InstructLabRegistry } from './registries/instructlab/InstructLabRegistry';
import { env, Uri } from '@podman-desktop/api';

export class InstructlabApiImpl implements InstructlabAPI {
  constructor(
    private instructlabManager: InstructlabManager,
    private instructLabSessions: InstructLabRegistry) {}

  async getIsntructlabSessions(): Promise<InstructlabSession[]> {
    return this.instructLabSessions.getSessions();
  }

  async requestNewSession(config: InstructLabSessionConfig): Promise<string> {
    return this.instructlabManager.requestNewSession(config);
  }

  async requestGenerateSession(uid: string): Promise<void> {
    return this.instructlabManager.requestGenerate(uid);
  }

  async openSessionDirectory(uid: string): Promise<boolean> {
    const session = this.instructLabSessions.get(uid);

    return env.openExternal(Uri.file(
      this.instructlabManager.getSessionDirectory(session),
    ));
  }

  async abortSession(uid: string): Promise<void> {
    return this.instructlabManager.abortSession(uid);
  }
}
