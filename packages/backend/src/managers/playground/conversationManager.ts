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

import { Publisher } from '../../utils/Publisher';
import { type ChatMessage, Conversation } from '@shared/src/models/IConversation';
import type { Disposable, Webview } from '@podman-desktop/api';
import { Messages } from '@shared/Messages';

export class ConversationManager extends Publisher<Conversation[]> implements Disposable {
  #conversations: Map<string, Conversation>;
  #scheduledSave: ReturnType<typeof setTimeout> | undefined;

  constructor(webview: Webview) {
    super(webview, Messages.MSG_CONVERSATIONS_UPDATE, () => this.getAll());
    this.#conversations = new Map<string, Conversation>();
    this.#scheduledSave = undefined;
  }

  init(): void {

  }

  private submit(conversationId: string, message: ChatMessage): void {
    if(this.#conversations.has(conversationId)) {
      throw new Error('Trying to submit a message to a non-existing conversation.');
    }

    const conversation = this.#conversations.get(conversationId);
    this.#conversations.set(conversationId, {
      ...conversation,
      messages: [...conversation.messages, message],
    });
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if(this.#scheduledSave !== undefined)
      return;
    this.#scheduledSave = setTimeout(() => {
      this.save().catch((err: unknown) => {
        console.error('Something went wrong while trying to save', err);
      });
      this.#scheduledSave = undefined;
    }, 1000 * 60);
  }

  private async save(): Promise<void> {

  }

  dispose(): void {
    // If we have a save scheduled it mean that we need to save.
    if(this.#scheduledSave) {
      clearTimeout(this.#scheduledSave);
      this.save().catch((err: unknown) => {
        console.error('Something went wrong while trying to save', err);
      }).finally(() => {
        this.#conversations.clear();
      });
    } else {
      this.#conversations.clear();
    }
  }

  getAll(): Conversation[] {
    return Array.from(this.#conversations.values());
  }
}
