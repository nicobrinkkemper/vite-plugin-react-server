declare module "react-dom/server.node" {
    interface PipeableStreamOptions {
      bootstrapModules?: string[];
      bootstrapScripts?: string[];
      bootstrapScriptContent?: string;
      signal?: AbortSignal;
      identifierPrefix?: string;
      namespaceURI?: string;
      nonce?: string;
      progressiveChunkSize?: number;
      onShellReady?: () => void;
      onAllReady?: () => void;
      onError?: (error: unknown) => void;
      importMap?: {
        imports?: Record<string, string>;
      };
    }
  
    interface NodeResponseOptions {
      moduleBasePath?: string;
      moduleBaseURL?: string;
    }
  
    interface PipeableStream {
      pipe: (destination: NodeJS.WritableStream) => NodeJS.WritableStream;
      abort: (reason?: any) => void;
    }
  
    export function renderToPipeableStream(
      children: React.ReactNode,
      options?: PipeableStreamOptions
    ): PipeableStream;
  
    export function resumeToPipeableStream(
      children: React.ReactNode,
      postponedState: object,
      options?: PipeableStreamOptions
    ): PipeableStream;
  
  } 