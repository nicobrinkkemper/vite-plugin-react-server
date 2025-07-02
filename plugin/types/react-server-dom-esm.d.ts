/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'react-server-dom-esm/client' {
  export type Options = {
    callServer?: (id: string, args: any[]) => Promise<any>;
    moduleBaseURL?: string;
    temporaryReferences?: Map<any, any>;
    signal?: AbortSignal;
  }

  export function createFromFetch(
    promiseForResponse: Promise<Response>,
    options?: Options
  ): Promise<any>;

  export function createFromReadableStream(
    stream: ReadableStream,
    options?: Options
  ): Promise<any>;

  export function createServerReference(
    id: string,
    callServer?: (id: string, args: any[]) => Promise<any>
  ): (...args: any[]) => Promise<any>;

  export function createTemporaryReferenceSet(): Map<any, any>;

  export function encodeReply(
    value: unknown,
    options?: {
      signal?: AbortSignal;
      temporaryReferences?: Map<unknown, unknown>;
    }
  ): Promise<FormData>;

  export function registerServerReference(
    reference: (...args: any[]) => Promise<any>,
    id: string
  ): void;
}

declare module 'react-server-dom-esm/server' {
  export type Options = {
    callServer?: (id: string, args: any[]) => Promise<any>;
    moduleBasePath?: string;
  }

  export function createTemporaryReferenceSet(): {
    add: (value: any) => void;
    has: (value: any) => boolean;
  };

  export function decodeAction(
    body: Uint8Array | string,
    serverManifest: any
  ): Promise<any>;

  export function decodeFormState(
    actionResult: any,
    body: Uint8Array | string,
    serverManifest: any
  ): Promise<any>;

  export function decodeReply(
    body: Uint8Array | string,
    moduleBasePath: string,
    options?: Options
  ): Promise<any>;

  export function decodeReplyFromBusboy(
    busboy: any,
    moduleBasePath: string,
    options?: Options
  ): Promise<any>;

  export function registerClientReference(
    reference: any,
    id: string,
    exportName?: string
  ): void;

  export function registerServerReference(
    reference: any,
    id: string,
    exportName?: string
  ): void;

  export function renderToPipeableStream(
    model: React.ReactNode,
    moduleBasePath: string,
    options?: Options
  ): {
    pipe: (writable: NodeJS.WritableStream) => void;
    abort: () => void;
  };

  export function unstable_prerenderToNodeStream(
    model: React.ReactNode,
    moduleBasePath: string,
    options?: Options
  ): NodeJS.ReadableStream;
}

declare module 'react-server-dom-esm/client.browser' {
  export function createFromFetch<R extends unknown>(
    promiseForResponse: Promise<Response>,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<R>;
      moduleBaseURL?: string;
    }
  ): Promise<R>;

  export function createFromReadableStream<R extends unknown>(
    stream: ReadableStream,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<R>;
      moduleBaseURL?: string;
    }
  ): Promise<R>;

  export function encodeReply(
    value: unknown,
    options?: {
      signal?: AbortSignal;
      temporaryReferences?: Map<unknown, unknown>;
    }
  ): Promise<FormData>;
}

declare module 'react-server-dom-esm/server.node' {
  import type { ReactElement } from 'react';

  export function createTemporaryReferenceSet(): Set;

  export type ReactServerDomEsmRenderToPipeableStreamOptions = {
    onError?: (error: Error, errorInfo: any) => void;
    identifierPrefix?: string;
    onPostpone?: (reason: string) => void;
    temporaryReferences?: WeakMap<any, any>;
    environmentName?: string;
    filterStackFrame?: (stackFrame: string) => string;
    importMap?: {
      imports?: Record<string, string>;
    };
    callServer?: (id: string, args: any[]) => Promise<any>;
    callClient?: (id: string, args: any[]) => Promise<any>;
  }

  export function renderToPipeableStream(
    element: ReactElement,
    moduleBasePath: string,
    options?: ReactServerDomEsmRenderToPipeableStreamOptions
  ): {
    pipe: (writable: NodeJS.WritableStream) => void;
    abort: () => void;
  };

  export function decodeReply(
    body: Uint8Array | string,
    moduleBasePath: string,
  ): Promise<any>;

  export function decodeAction(
    body: Uint8Array | string,
    serverManifest: any
  ): Promise<any>;

  export function decodeFormState(
    actionResult: any,
    body: Uint8Array | string,
    serverManifest: any
  ): Promise<any>;

  export function decodeReplyFromBusboy(
    busboy: any,
    moduleBasePath: string,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<any>;
      callClient?: (id: string, args: any[]) => Promise<any>;
    }
  ): Promise<any>;

  export function unstable_prerenderToNodeStream(
    model: React.ReactNode,
    moduleBasePath: string,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<any>;
      callClient?: (id: string, args: any[]) => Promise<any>;
    }
  ): NodeJS.ReadableStream;
}

declare module 'react-server-dom-esm/client.node' {
  
  export type CreateFromNodeStreamOptions = {
    nonce?: string;
    encodeFormAction?: (id: string, boundPromise: Promise<unknown>) => string;
    callServer?: (id: string, args: unknown[]) => Promise<unknown>;
  }
  export function createFromNodeStream(
    stream: NodeJS.ReadableStream,
    options?: {
      moduleMap?: Record<string, any>;
      moduleLoading?: {
        loadModule: (id: string) => Promise<any>;
      };
    }
  ): Promise<any>;
}

declare module 'react-server-dom-esm/client' {
  // No exports
}
