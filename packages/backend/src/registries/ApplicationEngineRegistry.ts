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
import { Publisher } from '../utils/Publisher';
import type { ApplicationInfo } from '@shared/src/models/IApplicationState';
import type { ApplicationRuntimeEngine, ApplicationState } from '../managers/applications/ApplicationRuntimeEngine';
import type { Webview } from '@podman-desktop/api';
import { Disposable } from '@podman-desktop/api';
import { Messages } from '@shared/Messages';
import type { RuntimeType } from '@shared/src/models/IInference';

export class ApplicationEngineRegistry extends Publisher<ApplicationInfo[]> implements Disposable {
  readonly #engines: Map<RuntimeType, ApplicationRuntimeEngine<unknown>>;

  constructor(webview: Webview) {
    super(webview, Messages.MSG_APPLICATIONS_STATE_UPDATE, () => this.getApplicationInfo());

    this.#engines = new Map();
  }

  dispose(): void {
    this.#engines.clear();
  }

  public register(engine: ApplicationRuntimeEngine<unknown>): Disposable {
    this.#engines.set(engine.runtime, engine);

    const disposable = engine.onUpdate(() => this.notify());

    return Disposable.create(() => {
      disposable.dispose();
      this.unregister(engine.runtime);
    });
  }

  getApplicationInfo(): ApplicationInfo[] {
    return Array.from(this.#engines.values())
      .map(engine =>  engine.getApplication())
      .flat()
      .map(applicationState => this.toApplicationInfo(applicationState));
  }

  private toApplicationInfo(state: ApplicationState<unknown>): ApplicationInfo {
    return {
      id: state.id,
      appPorts: state.appPorts,
      modelPorts: state.modelPorts,
      health: state.health,
      status: state.status,
      modelId: state.modelId,
      recipeId: state.recipeId,
    };
  }

  public getApplicationRuntime(type: RuntimeType): ApplicationRuntimeEngine<unknown> {
    const runtime = this.#engines.get(type);
    if(!runtime) throw new Error(`not application runtime registered for ${type}`);
    return runtime;
  }

  public unregister(type: RuntimeType): void {
    this.#engines.delete(type);
  }
}
