/**********************************************************************
 * Copyright (C) 2024-2025 Red Hat, Inc.
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

import type { Readable } from 'svelte/store';
import { readable } from 'svelte/store';
import { MSG_NEW_CATALOG_STATE } from '@shared/Messages';
import { rpcBrowser, studioClient } from '/@/utils/client';
import type { ApplicationCatalog } from '@shared/models/IApplicationCatalog';

const emptyCatalog = {
  categories: [],
  models: [],
  recipes: [],
};

export const catalog: Readable<ApplicationCatalog> = readable<ApplicationCatalog>(emptyCatalog, set => {
  const sub = rpcBrowser.subscribe(MSG_NEW_CATALOG_STATE, msg => {
    set(msg);
  });
  // Initialize the store manually
  studioClient
    .getCatalog()
    .then(state => {
      set(state);
    })
    .catch((err: unknown) => console.error('Error getting catalog:', err));
  return () => {
    sub.unsubscribe();
  };
});
