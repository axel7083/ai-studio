import type { ModelInfo } from './IModelInfo';

export interface InferenceServer {
  /**
   * Supported models
   */
  models: ModelInfo[];
  /**
   * Container info
   */
  container: {
    containerId: string;
    engineId: string;
  };
  connection: {
    port: number,
  },
  /**
   * Inference server status
   */
  status: 'stopped' | 'running',
  /**
   * From the readiness / liveliness return
   */
  ready: boolean; // health check
  /**
   * Exit code
   */
  exit?: number;
}
