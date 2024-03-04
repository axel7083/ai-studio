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
import { type Webview, type TelemetryLogger, containerEngine, Disposable } from "@podman-desktop/api";
import type { ContainerRegistry } from '../../registries/ContainerRegistry';
import type { PodmanConnection } from '../podmanConnection';
import { beforeEach, expect, describe, test, vi } from 'vitest';
import { InferenceManager } from './inferenceManager';

vi.mock('@podman-desktop/api', async () => {
  return {
    containerEngine: {
      listContainers: vi.fn(),
    },
    Disposable: {
      from: vi.fn(),
    },
  };
});

const webviewMock = {
  postMessage: vi.fn(),
} as unknown as Webview

const containerRegistryMock = {

} as unknown as ContainerRegistry;

const podmanConnectionMock = {
  onMachineStart: vi.fn(),
  onMachineStop: vi.fn(),
} as unknown as PodmanConnection;

const telemetryMock = {

} as unknown as TelemetryLogger;

let inferenceManager: InferenceManager;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(containerEngine.listContainers).mockResolvedValue([]);
  vi.mocked(webviewMock.postMessage).mockResolvedValue(undefined);

  inferenceManager = new InferenceManager(webviewMock, containerRegistryMock, podmanConnectionMock, telemetryMock);
});

describe('init Inference Manager', () => {
  test('should not have any servers', () => {
    inferenceManager.init();
    expect(inferenceManager.getServers().length).toBe(0);
    expect(containerEngine.listContainers).toHaveBeenCalled();
  });
});

describe('Start Inference Server', () => {

});

describe('Stop Inference Server', () => {

});
