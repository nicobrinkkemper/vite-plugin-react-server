/// <reference types="react-dom/server" />

declare module "react-server-dom-esm/server.node" {
    interface RequestInstanceOptions {
      onError?: (error: unknown) => void;
      identifierPrefix?: string;
      onPostpone?: (reason: unknown) => void;
      temporaryReferences?: WeakMap<any, unknown>;
      environmentName?: string;
      filterStackFrame?: (frame: string) => boolean;
      signal?: AbortSignal;
    }
  
    interface PipeableStream {
      abort: (reason?: unknown) => void;
      pipe: <Writable extends NodeJS.WritableStream>(
        destination: Writable
      ) => Writable & {
        on(event: "drain", listener: () => void): void;
        on(event: "error", listener: (error: Error) => void): void;
        on(event: "close", listener: () => void): void;
        on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
        on(event: "end", listener: () => void): void;
      };
    }
  
    export function renderToPipeableStream(
      model: React.ReactNode,
      moduleBasePath: string,
      options?: RequestInstanceOptions
    ): PipeableStream;
  
    export function registerClientReference(
      proxyImplementation: any,
      id: string,
      exportName: string
    ): any;
  
    export function registerServerReference(
      reference: any,
      id: string,
      exportName: string
    ): any;
  
    export function createTemporaryReferenceSet(): WeakMap<any, string>;
  
    export function decodeReply(
      body: string | FormData,
      moduleBasePath: string,
      options?: { temporaryReferences?: WeakMap<any, string> }
    ): Promise<any>;
  
    export function decodeReplyFromBusboy(
      busboyStream: any,
      moduleBasePath: string,
      options?: { temporaryReferences?: WeakMap<any, string> }
    ): Promise<any>;
  
    export function decodeAction(
      body: FormData,
      serverManifest: any
    ): Promise<((formData: FormData) => Promise<any>) | null>;
  
    export function decodeFormState(
      actionResult: any,
      body: FormData,
      serverManifest: any
    ): Promise<[any, string, string, number] | null>;
  }