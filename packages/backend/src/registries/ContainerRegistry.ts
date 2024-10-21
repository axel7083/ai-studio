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
import * as podmanDesktopApi from '@podman-desktop/api';

export type Subscriber = {
  id: number;
  callback: (status: string) => void;
};

export interface ContainerEvent {
  id: string;
}

export class ContainerRegistry implements podmanDesktopApi.Disposable {
  private count: number = 0;
  private startSubscribers: Map<string, Subscriber[]> = new Map();

  private readonly _onStartContainerEvent = new podmanDesktopApi.EventEmitter<ContainerEvent>();
  readonly onStartContainerEvent: podmanDesktopApi.Event<ContainerEvent> = this._onStartContainerEvent.event;

  private readonly _onDieContainerEvent = new podmanDesktopApi.EventEmitter<ContainerEvent>();
  readonly onDieContainerEvent: podmanDesktopApi.Event<ContainerEvent> = this._onDieContainerEvent.event;

  #eventDisposable: podmanDesktopApi.Disposable | undefined;

  init(): void {
    this.#eventDisposable = podmanDesktopApi.containerEngine.onEvent(event => {
      switch (event.status) {
        case 'start':
          this.onContainerStart(event.id);
          break;
        case 'die':
          this.onContainerDie(event.id);
          break;
      }

      if (this.startSubscribers.has(event.id)) {
        this.startSubscribers.get(event.id)?.forEach(subscriber => subscriber.callback(event.status));

        // If the event type is remove, we dispose all startSubscribers for the specific containers
        if (event.status === 'remove') {
          this.startSubscribers.delete(event.id);
        }
      }
    });
  }

  protected onContainerStart(id: string): void {
    this._onStartContainerEvent.fire({
      id: id,
    });
  }

  protected onContainerDie(id: string): void {
    this._onDieContainerEvent.fire({
      id: id,
    });
  }

  dispose(): void {
    this.#eventDisposable?.dispose();
  }

  subscribe(containerId: string, callback: (status: string) => void): podmanDesktopApi.Disposable {
    const subscriberId = ++this.count;
    const nSubs: Subscriber[] = [
      ...(this.startSubscribers.get(containerId) ?? []),
      {
        id: subscriberId,
        callback: callback,
      },
    ];

    this.startSubscribers.set(containerId, nSubs);
    return podmanDesktopApi.Disposable.create(() => {
      if (!this.startSubscribers.has(containerId)) return;

      this.startSubscribers.set(
        containerId,
        nSubs.filter(subscriber => subscriber.id !== subscriberId),
      );
    });
  }
}
