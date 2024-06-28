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
import { EventEmitter, type Event, kubernetes, type Disposable } from '@podman-desktop/api';
import {
  ADD,
  CHANGE,
  CoreV1Api,
  DELETE,
  ERROR,
  Informer,
  KubeConfig, makeInformer,
  UPDATE,
  type V1Pod,
} from '@kubernetes/client-node';

export function getKubeConfig(): KubeConfig {
  const uri = kubernetes.getKubeconfig();
  const config = new KubeConfig();
  config.loadFromFile(uri.fsPath);
  return config;
}

export function getLabels(): Record<string, string> {
  return {
    creator: 'podman-ai-lab',
  };
}

export function getLabelSelector(): string {
  return Object.entries(getLabels())
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

export function getCoreV1Api(): CoreV1Api {
  const config = getKubeConfig();
  return config.makeApiClient(CoreV1Api);
}

export const DEFAULT_NAMESPACE = 'default';

export interface KubernetesInformerEvent {
  status: ADD | UPDATE | CHANGE | DELETE | ERROR,
  pod: V1Pod,
}

export class KubernetesPodRegistry implements Disposable {
  #informer: Informer<V1Pod> | undefined;
  #kubeConfigDisposable: Disposable | undefined;


  private readonly _onInformerEvent = new EventEmitter<KubernetesInformerEvent>();
  readonly onInformerEvent: Event<KubernetesInformerEvent> = this._onInformerEvent.event;

  init(): void {
    this.#kubeConfigDisposable = kubernetes.onDidUpdateKubeconfig(() => {
      this.initInformer();
    });
    this.initInformer();
  }

  initInformer(): void {
    if(this.#informer) {
      this.#informer.stop().catch((err: unknown) => {
        console.error('Something went wrong while trying to stop informer', err);
      });
      this.#informer = undefined;
    }

    const coreApi = getCoreV1Api();

    const listFn = () => coreApi.listNamespacedPod(DEFAULT_NAMESPACE);
    this.#informer = makeInformer(
      getKubeConfig(),
      `/api/v1/namespaces/${DEFAULT_NAMESPACE}/pods`,
      listFn,
      getLabelSelector(),
    );
    this.#informer.on(ADD, this.updateStatus.bind(this, ADD));
    this.#informer.on(UPDATE, this.updateStatus.bind(this, UPDATE));
    this.#informer.on(CHANGE, this.updateStatus.bind(this, CHANGE));
    this.#informer.on(DELETE, this.updateStatus.bind(this, DELETE));
    this.#informer.on(ERROR, this.updateStatus.bind(this, ERROR));

    this.#informer.start().catch((err: unknown) => {
      console.error('Something went wrong while trying to start kubernetes informer', err);
    });
  }

  dispose(): void {
    this.#informer
      ?.stop()
      .catch((err: unknown) => {
        console.error('Something went wrong while trying to stop kubernetes informer', err);
      });

    this.#kubeConfigDisposable?.dispose();
  }

  protected updateStatus(status: ADD | UPDATE | CHANGE | DELETE | ERROR, pod: V1Pod): void {
    this._onInformerEvent.fire({
      status,
      pod,
    });
  }
}
