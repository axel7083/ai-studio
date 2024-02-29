import type { Webview } from '@podman-desktop/api';

export class Publisher<T> {

  constructor(
    private webview: Webview,
    private channel: string,
    private getter: () => T) {}

  notify(): void {
    this.webview
      .postMessage({
        id: this.channel,
        body: this.getter(),
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong while emitting ${this.channel}: ${String(err)}`);
      });
  }
}
