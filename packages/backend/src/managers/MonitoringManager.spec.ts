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

import { beforeEach, expect, afterEach, test, vi } from 'vitest';
import { MonitoringManager } from './MonitoringManager';
import { containerEngine, type ContainerStatsInfo, type Webview } from '@podman-desktop/api';
import { Messages } from '@shared/Messages';

vi.mock('@podman-desktop/api', async () => {
  return {
    containerEngine: {
      statsContainer: vi.fn(),
    },
  };
});

const webviewMock = {
  postMessage: vi.fn(),
} as unknown as Webview;

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(webviewMock.postMessage).mockResolvedValue(undefined);
  vi.mocked(containerEngine.statsContainer).mockResolvedValue(undefined);

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function simplifiedCallback(callback: (arg: ContainerStatsInfo) => void, cpu: number, ram: number): void {
  callback({
    cpu_stats: {
      cpu_usage: {
        total_usage: cpu,
      },
    },
    memory_stats: {
      usage: ram,
    },
  } as unknown as ContainerStatsInfo);
}

test('expect constructor to do nothing', () => {
  const manager = new MonitoringManager(webviewMock);
  expect(containerEngine.statsContainer).not.toHaveBeenCalled();
  expect(manager.getStats().length).toBe(0);
  expect(webviewMock.postMessage).not.toHaveBeenCalled();
});

test('expect monitor method to start stats container', async () => {
  const manager = new MonitoringManager(webviewMock);
  await manager.monitor('randomContainerId', 'dummyEngineId');

  expect(containerEngine.statsContainer).toHaveBeenCalledWith('dummyEngineId', 'randomContainerId', expect.anything());
});

test('expect monitor method to start stats container', async () => {
  const manager = new MonitoringManager(webviewMock);
  await manager.monitor('randomContainerId', 'dummyEngineId');

  expect(containerEngine.statsContainer).toHaveBeenCalledWith('dummyEngineId', 'randomContainerId', expect.anything());
});

test('expect dispose to dispose stats container', async () => {
  const manager = new MonitoringManager(webviewMock);
  const fakeDisposable = vi.fn();
  vi.mocked(containerEngine.statsContainer).mockResolvedValue({
    dispose: fakeDisposable,
  });

  await manager.monitor('randomContainerId', 'dummyEngineId');

  manager.dispose();
  expect(fakeDisposable).toHaveBeenCalled();
});

test('expect webview to be notified when statsContainer call back', async () => {
  const manager = new MonitoringManager(webviewMock);
  let mCallback: (stats: ContainerStatsInfo) => void;
  vi.mocked(containerEngine.statsContainer).mockImplementation(async (_engineId, _id, callback) => {
    mCallback = callback;
    return { dispose: () => {} };
  });

  await manager.monitor('randomContainerId', 'dummyEngineId');
  await vi.waitFor(() => {
    expect(mCallback).toBeDefined();
  });

  const date = new Date(2000, 1, 1, 13);
  vi.setSystemTime(date);

  simplifiedCallback(mCallback, 123, 99);

  expect(webviewMock.postMessage).toHaveBeenCalledWith({
    id: Messages.MSG_MONITORING_UPDATE,
    body: [{
      containerId: 'randomContainerId',
      stats: [
        {
          timestamp: Date.now(),
          cpu_usage: 123,
          memory_usage: 99,
        },
      ],
    }],
  });
});

test('expect stats to cumulate', async () => {
  const manager = new MonitoringManager(webviewMock);
  let mCallback: (stats: ContainerStatsInfo) => void;
  vi.mocked(containerEngine.statsContainer).mockImplementation(async (_engineId, _id, callback) => {
    mCallback = callback;
    return { dispose: () => {} };
  });

  await manager.monitor('randomContainerId', 'dummyEngineId');
  await vi.waitFor(() => {
    expect(mCallback).toBeDefined();
  });

  simplifiedCallback(mCallback, 0, 0);
  simplifiedCallback(mCallback, 1, 1);
  simplifiedCallback(mCallback, 2, 2);
  simplifiedCallback(mCallback, 3, 3);

  const stats = manager.getStats();
  expect(stats.length).toBe(1);
  expect(stats[0].stats.length).toBe(4);
});

test('expect old stats to be removed', async () => {
  const manager = new MonitoringManager(webviewMock);
  let mCallback: (stats: ContainerStatsInfo) => void;
  vi.mocked(containerEngine.statsContainer).mockImplementation(async (_engineId, _id, callback) => {
    mCallback = callback;
    return { dispose: () => {} };
  });

  await manager.monitor('randomContainerId', 'dummyEngineId');
  await vi.waitFor(() => {
    expect(mCallback).toBeDefined();
  });

  vi.setSystemTime(new Date(2000, 1, 1, 13));

  simplifiedCallback(mCallback, 0, 0);

  vi.setSystemTime( new Date(2005, 1, 1, 13));

  simplifiedCallback(mCallback, 1, 1);
  simplifiedCallback(mCallback, 2, 2);
  simplifiedCallback(mCallback, 3, 3);

  const stats = manager.getStats();
  expect(stats.length).toBe(1);
  expect(stats[0].stats.length).toBe(3);
});
