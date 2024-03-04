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
    engineId: string;
    containerId: string;
  };
  connection: {
    port: number,
  },
  /**
   * Inference server status
   */
  status: 'stopped' | 'running',
  /**
   * Health check
   */
  health?: {
    Status: string;
    FailingStreak: number;
    Log: Array<{
      Start: string;
      End: string;
      ExitCode: number;
      Output: string;
    }>;
  };
  /**
   * Exit code
   */
  exit?: number;
  /**
   * Logs
   * @deprecated
   */
  logs?: string[];
}
