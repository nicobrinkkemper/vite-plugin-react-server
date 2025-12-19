
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * React Server Components ESM Type Definitions
 * 
 * This file contains reverse-engineered type definitions for the experimental
 * react-server-dom-esm package. The types are based on the actual implementation
 * and may not match the official React types.
 * 
 * Module Structure:
 * - client.*: Client-side modules for consuming RSC streams in browser/Node.js
 * - server.*: Server-side modules for dynamic RSC rendering (runtime, interactive)
 * - static.*: Server-side modules for static pre-rendering (build-time, reusable)
 * 
 * This is a ambient module, don't export directly from this file.
 */

// Client-side modules (browser environment)
declare module 'react-server-dom-esm/client' {
  import type { ReactNode, Usable } from 'react';

  export type CreateFromFetchOptions = {
    moduleBaseURL?: string;
    callServer?: (id: string, args: any[]) => Promise<any>;
    temporaryReferences?: Map<any, any>;
    findSourceMapURL?: (filename: string, environmentName: string) => string | null;
    replayConsoleLogs?: boolean;
    environmentName?: string;
  };

  export type CreateFromReadableStreamOptions = CreateFromFetchOptions;

  export type EncodeReplyOptions = {
    temporaryReferences?: Map<any, any>;
    signal?: AbortSignal;
  };

  export function createFromFetch(
    promiseForResponse: Promise<Response>,
    options?: CreateFromFetchOptions
  ): Promise<ReactNode>;

  export function createFromReadableStream(
    stream: ReadableStream,
    options?: CreateFromReadableStreamOptions
  ): Promise<ReactNode>;

  export function createServerReference(
    id: string,
    callServer: (id: string, args: any[]) => Promise<any>,
    encodeFormAction?: any,
    findSourceMapURL?: (filename: string, environmentName: string) => string | null,
    functionName?: string
  ): Function;

  export function createTemporaryReferenceSet(): Map<any, any>;

  export function encodeReply(
    value: any,
    options?: EncodeReplyOptions
  ): Promise<string | FormData>;

  export function registerServerReference(
    reference: Function,
    id: string
  ): Function;
}

declare module 'react-server-dom-esm/client.browser' {
  import type { ReactNode } from 'react';

  // ReactDOM renderToPipeableStream options (for HTML rendering)
  export type RenderToPipeableStreamOptions = {
    onError?: (error: unknown) => void;
    onAllReady?: () => void;
    onShellReady?: () => void;
    onShellError?: (error: unknown) => void;
    onPostpone?: (reason: string) => void;
    identifierPrefix?: string;
    environmentName?: string;
    filterStackFrame?: (stackFrame: string) => string;
  };

  export function createFromFetch(
    promiseForResponse: Promise<Response>,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<any>;
      moduleBaseURL?: string;
      temporaryReferences?: Map<any, any>;
      findSourceMapURL?: (filename: string, environmentName: string) => string | null;
      replayConsoleLogs?: boolean;
      environmentName?: string;
    }
  ): Usable<ReactNode>;

  export function createFromReadableStream(
    stream: ReadableStream,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<any>;
      moduleBaseURL?: string;
      temporaryReferences?: Map<any, any>;
      findSourceMapURL?: (filename: string, environmentName: string) => string | null;
      replayConsoleLogs?: boolean;
      environmentName?: string;
    }
  ): Usable<ReactNode>;

  export function encodeReply(
    value: any,
    options?: {
      signal?: AbortSignal;
      temporaryReferences?: Map<any, any>;
    }
  ): Usable<string | FormData>;
}

// Node.js client module
declare module 'react-server-dom-esm/client.node' {
  import type { ReactNode } from 'react';

  export type CreateFromNodeStreamOptions = {
    encodeFormAction?: (id: string, boundPromise: Promise<unknown>) => string;
    nonce?: string;
    findSourceMapURL?: (url: string) => string;
    replayConsoleLogs?: boolean;
    environmentName?: string;
    temporaryReferences?: Map<any, any>;
  };

  export function createFromFetch(
    promiseForResponse: Promise<Response>,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<any>;
      moduleBaseURL?: string;
      temporaryReferences?: Map<any, any>;
      signal?: AbortSignal;
    }
  ): Promise<ReactNode>;

  export function createFromNodeStream(
    stream: NodeJS.ReadableStream,
    moduleRootPath: string,
    moduleBaseURL: string,
    options?: CreateFromNodeStreamOptions
  ): Promise<ReactNode>;
  
  export function createFromReadableStream(
    stream: ReadableStream,
    options?: {
      callServer?: (id: string, args: any[]) => Promise<any>;
      moduleBaseURL?: string;
      temporaryReferences?: Map<any, any>;
      signal?: AbortSignal;
    }
  ): Promise<ReactNode>;

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

/**
 * Server-side modules for dynamic RSC rendering (runtime, interactive)
 * 
 * The server modules are designed for dynamic server-side rendering with real-time data.
 * They export core RSC functionality for streaming, action handling, and component registration.
 * 
 * Key exports:
 * - renderToPipeableStream: For streaming RSC content
 * - decodeReply, decodeAction, decodeFormState: For handling client actions
 * - registerServerReference, registerClientReference: For component registration
 * - createTemporaryReferenceSet: For managing references
 */
declare module 'react-server-dom-esm/server' {
  import type { ReactElement, ReactNode } from 'react';

  export type RenderToPipeableStreamOptions = {
    onError?: (error: unknown) => void;
    identifierPrefix?: string;
    onPostpone?: (reason: string) => void;
    temporaryReferences?: WeakMap<any, any>;
    environmentName?: string;
    filterStackFrame?: (stackFrame: string) => string;
  };

  export type PipeableStream = {
    pipe: (destination: NodeJS.WritableStream) => NodeJS.WritableStream;
    abort: (reason?: any) => void;
  };

  export function createTemporaryReferenceSet(): WeakMap<any, any>;

  export function decodeAction(
    body: FormData,
    serverManifest: any
  ): Promise<((formData: FormData) => Promise<any>) | null>;

  export function decodeFormState(
    actionResult: any,
    body: FormData,
    serverManifest: any
  ): Promise<[any, string, string, number] | null>;

  export function decodeReply(
    body: Uint8Array | string,
    moduleBasePath: string,
    options?: {
      temporaryReferences?: WeakMap<any, any>;
    }
  ): Promise<any>;

  export function decodeReplyFromBusboy(
    busboy: any,
    moduleBasePath: string,
    options?: {
      temporaryReferences?: WeakMap<any, any>;
    }
  ): Promise<any>;

  export function registerClientReference(
    reference: any,
    id: string,
    exportName?: string
  ): any;

  export function registerServerReference(
    reference: Function,
    id: string,
    exportName?: string
  ): Function;

  export function renderToPipeableStream(
    element: ReactElement,
    moduleBasePath: string,
    options?: RenderToPipeableStreamOptions
  ): PipeableStream;
}

/**
 * Server-side Node.js module for dynamic RSC rendering
 * 
 * This module exports the same functionality as 'react-server-dom-esm/server'
 * but is specifically for Node.js environments with the 'react-server' condition.
 * 
 * Use case: Dynamic server-side rendering with real-time data and interactive features.
 */
declare module 'react-server-dom-esm/server.node' {
  import type { ReactElement, ReactNode } from 'react';

  export function createTemporaryReferenceSet(): WeakMap<any, any>;
  
  export type RenderToPipeableStreamOptions = {
    onError?: (error: unknown) => void;
    onPostpone?: (reason: string) => void;
    identifierPrefix?: string;
    temporaryReferences?: WeakMap<any, any>;
    environmentName?: string;
    filterStackFrame?: (stackFrame: string) => string;
  };

  export type PrerenderToNodeStreamOptions = {
    onError?: (error: unknown) => void;
    identifierPrefix?: string;
    onPostpone?: (reason: string) => void;
    temporaryReferences?: WeakMap<any, any>;
    environmentName?: string;
    filterStackFrame?: (stackFrame: string) => string;
  };  

  export type PipeableStream = {
    pipe: (destination: NodeJS.WritableStream) => NodeJS.WritableStream;
    abort: (reason?: any) => void;
  };

  export function renderToPipeableStream(
    element: ReactElement,
    moduleBasePath: string,
    options?: RenderToPipeableStreamOptions
  ): PipeableStream;

  export function decodeReply(
    body: Uint8Array | string,
    moduleBasePath: string,
    options?: {
      temporaryReferences?: WeakMap<any, any>;
    }
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

  export function decodeReplyFromBusboy(
    busboy: any,
    moduleBasePath: string,
    options?: {
      temporaryReferences?: WeakMap<any, any>;
    }
  ): Promise<any>;

  export function registerServerReference(
    reference: Function,
    id: string,
    exportName?: string
  ): Function;

  export function registerClientReference(
    proxyImplementation: any,
    id: string,
    exportName: string
  ): any;

}

/**
 * Server-side Node.js module for static pre-rendering (build-time, reusable)
 * 
 * The static module is specifically designed for static site generation where you want to:
 * 1. Pre-render RSC content to a stream
 * 2. Save that stream for later reuse
 * 3. Use it as input for other renders
 * 
 * Key difference from server.* modules:
 * - server.* = Dynamic rendering (runtime, interactive)
 * - static.* = Pre-rendering (build-time, reusable streams)
 * 
 * Use case: Static site generation, build-time RSC stream creation for reuse
 */
declare module 'react-server-dom-esm/static.node' {
  import type { ReactElement, ReactNode } from 'react';

  export type PrerenderToNodeStreamOptions = {
    onError?: (error: unknown) => void;
    identifierPrefix?: string;
    onPostpone?: (reason: string) => void;
    temporaryReferences?: WeakMap<any, any>;
    environmentName?: string;
    filterStackFrame?: (stackFrame: string) => string;
    signal?: AbortSignal;
  };

  export function unstable_prerenderToNodeStream(
    model: ReactNode,
    moduleBasePath: string,
    options?: PrerenderToNodeStreamOptions
  ): React.Usable<ReactNode>;
}