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
import type { Disposable, Webview } from '@podman-desktop/api';
import type {
  InstructlabContainer,
  InstructlabSession,
  InstructLabSessions,
  InstructLabState,
} from '@shared/src/models/instructlab/IInstructlabSession';
import { join } from 'node:path';
import { stat, readFile, mkdir, writeFile } from 'node:fs/promises';
import { isNameValid } from '../../utils/instructlab';
import { Messages } from '@shared/Messages';

export class InstructLabRegistry extends Publisher<InstructlabSession[]> implements Disposable {
  // session uid => session
  #sessions: Map<string, InstructlabSession>;

  constructor(
    webview: Webview,
    private appUserDirectory: string,
  ) {
    super(webview, Messages.MSG_INSTRUCTLAB_SESSIONS_UPDATE, () => this.getSessions());
    this.#sessions = new Map<string, InstructlabSession>();
  }

  public init(): void {
    this.loadSessions().catch((err: unknown) => {
      console.error('Something went wrong while trying to load sessions', err);
    });
  }

  public getSessions(): InstructlabSession[] {
    return Array.from(this.#sessions.values());
  }

  public get(uid: string): InstructlabSession {
    const session = this.#sessions.get(uid);
    if (!session) throw new Error(`unknown session uid ${uid}`);
    return session;
  }

  public setState(uid: string, state: InstructLabState): void {
    const session = this.get(uid);
    this.#sessions.set(session.uid, {
      ...session,
      state: state,
    });
    this.notify();
    this.flush();
  }

  public register(session: InstructlabSession): void {
    this.#sessions.set(session.uid, session);
    this.notify();
    this.flush();
  }

  // not sure about that
  public registerContainer(uid: string, container: InstructlabContainer): void {
    const session = this.get(uid);
    const containers = (session.containers ?? []).filter(
      mContainer => container.connection.containerId === mContainer.connection.containerId,
    );

    this.#sessions.set(session.uid, {
      ...session,
      containers: [...containers, container],
    });
    this.notify();
    this.flush();
  }

  public dispose(): void {
    this.#sessions.clear();
  }

  protected getInstructLabDirectory(): string {
    return join(this.appUserDirectory, 'instructlab');
  }

  protected getSessionDirectory(session: InstructlabSession): string {
    return join(this.getInstructLabDirectory(), session.uid);
  }

  protected getInstructLabSessionsFile(): string {
    return join(this.getInstructLabDirectory(), 'sessions.json');
  }

  protected async saveSessions(): Promise<void> {
    // ensure directory exists
    await this.initInstructLabDirectory();
    const sessionsFile = this.getInstructLabSessionsFile();

    // save the sessions
    return writeFile(
      sessionsFile,
      JSON.stringify({
        version: '1.0',
        sessions: this.getSessions(),
      } as InstructLabSessions),
    );
  }

  protected async initInstructLabDirectory(): Promise<void> {
    await mkdir(this.getInstructLabDirectory(), { recursive: true });
  }

  protected flush(): void {
    this.saveSessions().catch((err: unknown) => {
      console.error(err);
    });
  }

  /**
   * Consider using some dedicated library like ajv
   * @protected
   */
  protected async loadSessions(): Promise<void> {
    // ensure directory exists
    await this.initInstructLabDirectory();

    const sessionsFile = this.getInstructLabSessionsFile();
    try {
      await stat(sessionsFile);
    } catch (err) {
      console.debug(err);
      return;
    }

    const rawContent: string = await readFile(sessionsFile, 'utf-8');
    const parsed = JSON.parse(rawContent);
    if (!parsed || typeof parsed !== 'object') throw new Error(`invalid ${sessionsFile}`);
    if (!('version' in parsed)) throw new Error(`missing version in ${sessionsFile}`);
    if (parsed.version !== '1.0')
      throw new Error(`invalid version in ${sessionsFile} expected 1.0 got ${parsed.version}`);

    if (!('sessions' in parsed)) throw new Error(`missing sessions in ${sessionsFile}`);
    if (!Array.isArray(parsed.sessions)) throw new Error(`sessions not an array in ${sessionsFile}`);
    for (const session of parsed.sessions) {
      if (!session || typeof session !== 'object') throw new Error(`invalid ${session}`);
      if (!('uid' in session) || typeof session.uid !== 'string')
        throw new Error(`invalid uid for session in ${sessionsFile}`);
      if (!('baseImage' in session) || typeof session.baseImage !== 'string')
        throw new Error(`invalid baseImage for session ${session.uid}`);
      if (!('name' in session) || (typeof session.name !== 'string' && !isNameValid(session.name)))
        throw new Error(`invalid name for session ${session.uid}`);
      if (!('teacherModelId' in session) || typeof session.teacherModelId !== 'string')
        throw new Error(`invalid teacherModelId for session ${session.uid}`);
      if (!('targetModel' in session) || typeof session.targetModel !== 'string')
        throw new Error(`invalid targetModel for session ${session.uid}`);
      if (!('repository' in session) || typeof session.repository !== 'string')
        throw new Error(`invalid repository for session ${session.uid}`);
      if (!('createdTime' in session) || typeof session.createdTime !== 'number')
        throw new Error(`invalid createdTime for session ${session.uid}`);
      if (!('training' in session) || typeof session.training !== 'string')
        throw new Error(`invalid training for session ${session.uid}`);
      if (!('state' in session) || typeof session.state !== 'string')
        throw new Error(`invalid state for session ${session.uid}`);
      // validate labels
      if (!('labels' in session) || typeof session.labels !== 'object')
        throw new Error(`invalid labels for session ${session.uid}`);
      if (Array.from(Object.values(session.labels)).some(value => typeof value !== 'string'))
        throw new Error(`invalid labels for session in ${session.uid}`);

      // validate connection if exists
      if ('connection' in session) {
        if (!session.connection || typeof session.connection !== 'object')
          throw new Error(`invalid connection ${session.uid}`);
        if (!('providerId' in session.connection) || typeof session.connection.providerId !== 'string')
          throw new Error(`invalid providerId for connection in session ${session.uid}`);
        if (!('name' in session.connection) || typeof session.connection.name !== 'string')
          throw new Error(`invalid name for connection in session ${session.uid}`);
      }

      this.#sessions.set(session.uid, session);
    }

    this.notify();
  }
}
