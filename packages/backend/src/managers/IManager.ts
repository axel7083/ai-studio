import { Disposable } from '@podman-desktop/api';

export interface Manager {
  init(): Disposable;
}
