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
    const responsiveWorker = {
      postMessage: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          // Immediately respond with a chunk and end
          setTimeout(() => {
            handler({ type: 'RSC_CHUNK', id: '/test', chunk: new Uint8Array([1, 2, 3]) });
            handler({ type: 'RSC_END', id: '/test' });
          }, 0);
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

    // Start the stream - this should trigger postMessage
    const result = await stream.next();
    
    // Verify worker.postMessage was called
    expect(responsiveWorker.postMessage).toHaveBeenCalledWith({
      ...testMessage,
      type: 'RSC_RENDER',
      id: '/test',
    });

    // Verify we got a chunk
    expect(result.value).toEqual(new Uint8Array([1, 2, 3]));
    
    // Get the end result
    const endResult = await stream.next();
    expect(endResult.done).toBe(true);
  });

  it('should handle errors from worker', async () => {
    const errorWorker = {
      postMessage: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({ 
              type: 'ERROR', 
              id: '/test', 
              error: new Error('Worker error'),
              errorInfo: { componentStack: 'test stack' }
            });
            // Error should close the stream, but let's also send an end to be sure
            handler({ type: 'RSC_END', id: '/test' });
          }, 0);
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

    // Start the stream and wait for error
    await stream.next();
    
    // Verify error handler was called
    expect(mockHandlers.onError).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        message: 'Worker error',
        name: 'Error'
      }),
      { componentStack: 'test stack' }
    );

    // Stream should be closed after error
    const endResult = await stream.next();
    expect(endResult.done).toBe(true);
  });
}); 