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
    port: number;
    engineId: string;
  };
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