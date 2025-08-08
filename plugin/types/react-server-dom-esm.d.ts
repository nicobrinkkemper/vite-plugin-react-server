
/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'react-server-dom-esm/client.node' {
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

  export function createFromNodeStream(
    stream: NodeJS.ReadableStream,
    moduleRootPath: string,
    moduleBaseURL: string,
    options?: {
      encodeFormAction?: (id: string, boundPromise: Promise<unknown>) => string;
      nonce?: string;
      findSourceMapURL?: (url: string) => string;
      replayConsoleLogs?: boolean;
      environmentName?: string;
    }
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

  export function createTemporaryReferenceSet(): WeakMap<any, any>;

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

  export type RenderToPipeableStreamOptions = {
    /**
     * Called when a React error occurs during streaming (including thrown errors in components).
     */
    onError?: (error: unknown, errorInfo?: {
      componentStack?: string | null;
      digest?: string | null;
    }) => void;
    /**
     * Called when all content is ready to be streamed (for SSR).
     */
    onAllReady?: () => void;
    /**
     * Called when the shell (HTML frame) is ready to be streamed.
     */
    onShellReady?: () => void;
    /**
     * Called if the shell cannot be rendered at all (critical error).
     */
    onShellError?: (error: unknown) => void;
    /**
     * Called if a component is postponed (React Flight/experimental).
     */
    onPostpone?: (reason: string) => void;
    /**
     * Optionally provide a WeakMap for temporary references (advanced/Flight).
     */
    temporaryReferences?: WeakMap<any, any>;
    /**
     * Optionally set a string prefix for element IDs (advanced).
     */
    identifierPrefix?: string;
    /**
     * Optionally set the environment name (for debugging).
     */
    environmentName?: string;
    /**
     * Optionally filter stack frames (for debugging).
     */
    filterStackFrame?: (stackFrame: string) => string;
  };

  /**
   * Renders a React element to a Node.js pipeable stream (RSC/SSR).
   * Only the handlers listed in RenderToPipeableStreamOptions are supported.
   */
  export function renderToPipeableStream(
    model: React.ReactNode,
    moduleBasePath: string,
    options?: RenderToPipeableStreamOptions
  ): {
    pipe: (destination: NodeJS.WritableStream) => void;
    abort: (reason?: unknown) => void;
  };

  export function unstable_prerenderToNodeStream(
    model: React.ReactNode,
    moduleBasePath: string,
    options?: Options
  ): NodeJS.ReadableStream;
}

declare module 'react-server-dom-esm/client.browser' {
  export function createFromFetch<R>(
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
  import type { ReactElement, ReactNode } from 'react';

  export function createTemporaryReferenceSet(): Set;

  export function renderToPipeableStream(
    element: any,
    moduleBasePath: string,
    options?: RenderToPipeableStreamOptions
  ): PipeableStream;

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