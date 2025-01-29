
declare module "react-server-dom-esm/client.node" {
    export interface CreateFromNodeStreamOptions {
      /**
       * Optional nonce for script tags
       */
      nonce?: string;
  
      /**
       * Function to find source map URLs for debugging
       */
      findSourceMapURL?: (source: string, env: string) => string | null;
  
      /**
       * Whether to replay console logs from the server
       * @default false
       */
      replayConsoleLogs?: boolean;
  
      /**
       * Name of the environment (e.g. "Server", "Client")
       * @default "Server"
       */
      environmentName?: string;
  
      /**
       * Form action encoding handler
       */
      encodeFormAction?: boolean;
    }
  
    /**
     * Creates a React element from a Node.js Readable stream containing an RSC payload
     *
     * @param stream - Node.js Readable stream containing RSC data
     * @param moduleRootPath - Root path for resolving modules (becomes bundlerConfig internally)
     * @param moduleBaseURL - Base URL for module loading
     * @param options - Additional options
     */
    export function createFromNodeStream<T>(
      stream: import("node:stream").Readable,
      moduleRootPath: string,
      moduleBaseURL: string,
      options?: CreateFromNodeStreamOptions
    ): React.Usable<T>;
  
    export * from "react-server-dom-esm/client.browser";
  }