import type { ModelInfo } from './IModelInfo';

export interface InferenceServerConfig {
  /**
   * Port to expose
   */
  port: number,
  /**
   * The identifier of the container provider to use
   */
  providerId?: string;
  /**
   * Image to use
   */
  image: string,
  /**
   * Labels to use for the container
   */
  labels: {[id: string]: string},

  /**
   * Model info for the models
   */
  modelsInfo: ModelInfo[];
}
