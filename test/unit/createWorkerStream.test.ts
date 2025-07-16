import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWorkerStream } from 'vite-plugin-react-server/client';
import type { Worker } from 'node:worker_threads';
import type { Logger } from 'vite';
import type { RscRenderOpt } from 'vite-plugin-react-server/rsc-worker';
import type { StreamHandlers } from 'vite-plugin-react-server/worker';

describe('createWorkerStream', () => {
  let mockWorker: Worker;
  let mockLogger: Logger;
  let mockHandlers: StreamHandlers;
  const testMessage: RscRenderOpt = {
    type: 'RSC_RENDER',
    id: '/test',
    route: '/test',
    moduleBase: 'src',
    moduleRootPath: 'dist/client',
    moduleBasePath: '/',
    moduleBaseURL: '/',
    projectRoot: '/',
    publicOrigin: '/',
    pageExportName: 'Page',
    propsExportName: 'props',
    rootExportName: 'Root',
    htmlExportName: 'Html',
    pagePath: 'src/pages/test.tsx',
    propsPath: 'src/pages/test.props.ts',
    pipeableStreamOptions: {},
    verbose: false,
    css: {
      inlineCss: undefined,
      inlineThreshold: 4096,
      inlinePatterns: [],
      linkPatterns: []
    },
    build: {
      outDir: 'dist',
      pages: ['/test'],
      server: 'server',
      static: 'static',
      client: 'client',
      rscOutputPath: 'rsc',
      htmlOutputPath: 'html',
    },
    manifest: {},
    cssFiles: new Map(),
    globalCss: new Map()
  };

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      warnOnce: vi.fn(),
      clearScreen: vi.fn(),
      hasWarned: false,
      hasErrorLogged: () => false,
    };

    mockHandlers = {
      onError: vi.fn(),
      onHmrAccept: vi.fn(),
      onHmrUpdate: vi.fn(),
      onMetrics: vi.fn(),
      onData: vi.fn(),
      onEnd: vi.fn(),
      onServerAction: vi.fn(),
      onServerActionResponse: vi.fn(),
      onCssFile: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error if worker is not running', async () => {
    const stream = createWorkerStream({
      worker: null as unknown as Worker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    await expect(stream.next()).rejects.toThrow('Worker is not running');
  });

  it('should create an async generator stream', () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Verify the stream is an async generator
    expect(typeof stream.next).toBe('function');
    expect(typeof stream.return).toBe('function');
    expect(typeof stream.throw).toBe('function');
    expect(typeof stream[Symbol.asyncIterator]).toBe('function');
  });

  it('should call worker.postMessage when stream starts', async () => {
    // Create a mock worker that responds immediately
    let messageHandler: ((msg: any) => void) | null = null;
    const responsiveWorker = {
      postMessage: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
          // Send chunk and end immediately
          if (messageHandler) {
            messageHandler({ type: 'RSC_CHUNK', id: '/test', chunk: new Uint8Array([1, 2, 3]) });
            messageHandler({ type: 'RSC_END', id: '/test' });
          }
        }
      }),
      removeListener: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    const stream = createWorkerStream({
      worker: responsiveWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Get the first chunk
    const result = await stream.next();
    
    // Verify worker.postMessage was called
    expect(responsiveWorker.postMessage).toHaveBeenCalledWith({
      ...testMessage,
      type: 'RSC_RENDER',
      id: '/test',
    });

    // Verify we got the chunk
    expect(result.value).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.done).toBe(false);
  });

  it('should handle errors from worker', async () => {
    let messageHandler: ((msg: any) => void) | null = null;
    const errorWorker = {
      postMessage: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
          if (messageHandler) {
            messageHandler({ 
              type: 'ERROR', 
              id: '/test', 
              error: new Error('Worker error'),
              errorInfo: { componentStack: 'test stack' }
            });
            messageHandler({ type: 'RSC_END', id: '/test' });
          }
        }
      }),
      removeListener: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    const stream = createWorkerStream({
      worker: errorWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Get the first chunk (should be null due to error)
    const result = await stream.next();
    
    // Verify error handler was called
    expect(mockHandlers.onError).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        message: 'Worker error',
        name: 'Error'
      }),
      { componentStack: 'test stack' }
    );

    // Stream should end with null
    expect(result.value).toBe(undefined);
    expect(result.done).toBe(true);
  });

  it('should handle multiple chunks in a loop', async () => {
    let messageHandler: ((msg: any) => void) | null = null;
    const multiChunkWorker = {
      postMessage: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          messageHandler = handler;
          if (messageHandler) {
            // Send multiple chunks
            messageHandler({ type: 'RSC_CHUNK', id: '/test', chunk: new Uint8Array([1, 2, 3]) });
            messageHandler({ type: 'RSC_CHUNK', id: '/test', chunk: new Uint8Array([4, 5, 6]) });
            messageHandler({ type: 'RSC_CHUNK', id: '/test', chunk: new Uint8Array([7, 8, 9]) });
            messageHandler({ type: 'RSC_END', id: '/test' });
          }
        }
      }),
      removeListener: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    const stream = createWorkerStream({
      worker: multiChunkWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Get the first chunk
    const result = await stream.next();
    
    // Verify we got the first chunk
    expect(result.value).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.done).toBe(false);
  });
}); 