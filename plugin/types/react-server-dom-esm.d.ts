declare module 'react-server-dom-esm/server.node' {
  import { ReactElement, type Usable } from 'react';
  import { Writable } from 'stream';

  export function createTemporaryReferenceSet(): WeakMap<any, any>;

  /* example
         options ? options.onError : void 0,
+          options ? options.identifierPrefix : void 0,
+          options ? options.onPostpone : void 0,
+          options ? options.temporaryReferences : void 0,
+          options ? options.environmentName : void 0,
+          options ? options.filterStackFrame : void 0,
*/
  export interface ReactServerDomEsmRenderToPipeableStreamOptions {
    onError?: (error: Error, errorInfo: any) => void;
    identifierPrefix?: string;
    onPostpone?: (reason: string) => void;
    temporaryReferences?: WeakMap<any, any>;
    environmentName?: string;
    filterStackFrame?: (stackFrame: string) => string;
    importMap?: {
      imports?: Record<string, string>;
    };
  }
  export function renderToPipeableStream(
    element: ReactElement,
    moduleBasePath: string,
    options?: ReactServerDomEsmRenderToPipeableStreamOptions
  ): PipeableStream;
  export function decodeReplyFromBusboy(busboyStream: any): Promise<unknown>;
  export function decodeReply(reply: string): Promise<unknown>;
  export function decodeAction(action: string): Promise<unknown>;
  export function decodeFormState(formState: string): Promise<unknown>;
  export function registerServerReference(proxy: any, id: string): void;
  export function registerClientReference(proxy: any, id: string): void;


  export interface PipeableStream {
    pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
    abort: () => void;
  }
} 

declare module 'react-server-dom-esm/client.node' {
  import { ReactElement } from 'react';
  import { Writable } from 'stream';
  
  export interface CreateFromNodeStreamOptions {
    nonce?: string;
    encodeFormAction?: (id: string, boundPromise: Promise<unknown>) => string;
  }
  export function createFromNodeStream(stream: NodeJS.ReadableStream, moduleRootPath: string, moduleBaseURL: string, options?: CreateFromNodeStreamOptions): Usable;
}
