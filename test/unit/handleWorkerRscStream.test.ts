import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleWorkerRscStream } from '../../dist/plugin/react-client/handleWorkerRscStream.js';
import type { Worker } from 'node:worker_threads';
import type { Logger } from 'vite';
import type { StreamHandlers } from '../../dist/plugin/worker/types.js';
import { RscRenderOpt } from '../../plugin/worker/rsc/types.js';

describe('handleWorkerRscStream', () => {
  let mockWorker: Worker;
  let mockLogger: Logger;
  let mockHandlers: StreamHandlers;
  let mockMessageHandler: (msg: any) => void;
  let mockRes: any;

  beforeEach(() => {
    mockMessageHandler = vi.fn();
    mockWorker = {
      postMessage: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          mockMessageHandler = handler;
        }
      }),
      removeListener: vi.fn(),
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
      onData: vi.fn(),
      onEnd: vi.fn(),
      onMetrics: vi.fn(),
      onHmrAccept: vi.fn(),
      onHmrUpdate: vi.fn(),
      onServerAction: vi.fn(),
      onServerActionResponse: vi.fn(),
      onCssFile: vi.fn(),
    };

    mockRes = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMessage = (route: string): RscRenderOpt => ({
    route,
    moduleBase: 'src',
    moduleRootPath: 'dist/client',
    moduleBasePath: '/',
    moduleBaseURL: '/',
    projectRoot: '/',
    publicOrigin: '/',
    pageExportName: 'Page',
    propsExportName: 'props',
    pagePath: 'src/pages/test.tsx',
    propsPath: 'src/pages/test.props.ts',
    pipeableStreamOptions: {},
    verbose: false,
    build: {
      pages: ['/test'],
      outDir: 'dist',
      server: 'dist/server',
      static: 'dist/static',
      client: 'dist/client',
      rscOutputPath: 'index.rsc',
      htmlOutputPath: 'index.html'
    },
    css: {
      inlineCss: false,
      inlineThreshold: 0,
      inlinePatterns: [],
      linkPatterns: []
    },
    manifest: {},
    cssFiles: new Map(),
    globalCss: new Map(),
    type: 'RSC_RENDER',
    id: route,
  });

  it('should handle RSC stream correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleWorkerRscStream({
      worker: mockWorker,
      message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false
    });

    // Verify worker message was sent
    expect(mockWorker.postMessage).toHaveBeenCalledWith(message);

    // Verify message handler was set up
    expect(mockWorker.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should handle RSC chunks correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleWorkerRscStream({
      worker: mockWorker,
      message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false
    });

    // Simulate RSC chunk message
    const chunk = new Uint8Array([1, 2, 3]);
    mockMessageHandler({ type: 'RSC_CHUNK', id: route, chunk });

    // Verify chunk was written to response and handler was called
    expect(mockHandlers.onData).toHaveBeenCalledWith(route, chunk);
  });

  it('should handle RSC end correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleWorkerRscStream({
      worker: mockWorker,
      message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false
    });

    // Simulate RSC end message
    mockMessageHandler({ type: 'RSC_END', id: route });

    // Verify handler was called
    expect(mockHandlers.onEnd).toHaveBeenCalledWith(route);
    expect(mockWorker.removeListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should handle errors correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleWorkerRscStream({
      worker: mockWorker,
      message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false
    });

    // Simulate error message
    const error = new Error('Test error');
    mockMessageHandler({ type: 'ERROR', id: route, error });

    // Verify error was logged and handler was called
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockHandlers.onError).toHaveBeenCalledWith(route, {
      message: "Test error",
      name: "Error",
      stack: expect.stringContaining("Error: Test error")
    }, undefined);
  });

  it('should handle metrics correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleWorkerRscStream({
      worker: mockWorker,
      message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false
    });

    // Simulate metrics message
    const metrics = { chunks: 5, bytes: 100 };
    mockMessageHandler({ type: 'RSC_METRICS', id: route, metrics });

    // Verify metrics handler was called
    expect(mockHandlers.onMetrics).toHaveBeenCalledWith(route, metrics);
  });

  it('should handle HMR updates correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleWorkerRscStream({
      worker: mockWorker,
      message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false
    });

    // Simulate HMR update message
    const routes = ['/test', '/other'];
    mockMessageHandler({ type: 'HMR_UPDATE', id: route, routes });

    // Verify HMR update handler was called
    expect(mockHandlers.onHmrUpdate).toHaveBeenCalledWith(route, routes);
  });

  it('should handle CSS files correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleWorkerRscStream({
      worker: mockWorker,
      message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false
    });

    // Simulate CSS file message
    const cssContent = '.test { color: red; }';
    mockMessageHandler({ type: 'CSS_FILE', id: route, content: cssContent });

    // Verify CSS file handler was called
    expect(mockHandlers.onCssFile).toHaveBeenCalledWith(route, cssContent);
  });
}); 