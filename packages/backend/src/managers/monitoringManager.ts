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
import { type Disposable, type Webview, containerEngine, type ContainerStatsInfo } from '@podman-desktop/api';
import { Publisher } from '../utils/Publisher';
import { Messages } from '@shared/Messages';
import type { ModelsManager } from './modelsManager';
import { dirSize, getDiskSize } from '../utils/pathUtils';
import type { IStorageInfo } from '@shared/src/models/IStorageInfo';

export interface StatsInfo {
  timestamp: number;
  cpu_usage: number;
  memory_usage: number;
}

export interface StatsHistory {
  containerId: string;
  stats: StatsInfo[];
}

export const MAX_AGE: number = 5 * 60 * 1000; // 5 minutes

export class MonitoringManager extends Publisher<StatsHistory[]> implements Disposable {
  #containerStats: Map<string, StatsHistory>;
  #disposables: Disposable[];

  constructor(
    webview: Webview,
    private modelsManager: ModelsManager,
  ) {
    super(webview, Messages.MSG_MONITORING_UPDATE, () => this.getStats());
    this.#containerStats = new Map<string, StatsHistory>();
    this.#disposables = [];
  }

  /**
   * Get storage info for the local models
   */
  async statsLocalModels(): Promise<IStorageInfo> {
    const modelsDir = this.modelsManager.getModelsDirectory();
    const modelsDirSize = await dirSize(modelsDir);
    const diskSize = await getDiskSize(modelsDir);

    return {
      name: 'Local Models',
      available: diskSize.bavail * diskSize.bsize,
      used: modelsDirSize,
      path: modelsDir,
    };
  }

  async monitor(containerId: string, engineId: string): Promise<Disposable> {
    const disposable = await containerEngine.statsContainer(engineId, containerId, statsInfo => {
      if ('cause' in statsInfo) {
        console.error('Cannot stats container', statsInfo.cause);
        disposable.dispose();
      } else {
        this.push(containerId, statsInfo);
      }
    });
    this.#disposables.push(disposable);
    return disposable;
  }

  private push(containerId: string, statsInfo: ContainerStatsInfo): void {
    let stats: StatsInfo[] = [];
    if (this.#containerStats.has(containerId)) {
      const limit = Date.now() - MAX_AGE;
      stats = this.#containerStats.get(containerId).stats.filter(stats => stats.timestamp > limit);
    }

    this.#containerStats.set(containerId, {
      containerId: containerId,
      stats: [
        ...stats,
        {
          timestamp: Date.now(),
          cpu_usage: statsInfo.cpu_stats.cpu_usage.total_usage,
          memory_usage: statsInfo.memory_stats.usage,
        },
      ],
    });
    this.notify();
  }

  clear(containerId: string): void {
    this.#containerStats.delete(containerId);
  }

  getStats(): StatsHistory[] {
    return Array.from(this.#containerStats.values());
  }

  dispose(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
  }
}
