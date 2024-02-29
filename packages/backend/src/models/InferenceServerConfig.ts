import type { ImageInfo } from '@podman-desktop/api';

export interface InferenceServerConfig {
  /**
   * Port to expose
   */
  port: number,
  /**
   * Image info for the container
   */
  image: ImageInfo,
  /**
   * Labels to use for the container
   */
  labels: {[id: string]: string},
  /**
   * Path to the local models directory
   */
  models: string,
}
