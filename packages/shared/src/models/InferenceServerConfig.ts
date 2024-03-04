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
   * Path to the local models directory
   */
  models: string,
}
