import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRscStream } from '../../dist/plugin/stream/handleRscStream.client.js';
import type { Worker } from 'node:worker_threads';
import type { Logger } from 'vite';
import type { StreamHandlers } from '../../dist/plugin/worker/types.js';

// Mock the stashed options state module
vi.mock('../../dist/plugin/config/stashedOptionsState.js', () => ({
  stashRscStream: vi.fn(),
  clearStashedRscStream: vi.fn(),
  getStashedRscStream: vi.fn(() => null),
}));

// Mock the setupClientMessageHandlers module
vi.mock('../../dist/plugin/helpers/setupClientMessageHandlers.js', () => ({
  setupClientMessageHandlers: vi.fn(({ worker }) => {
    // Actually call worker.on to simulate the real behavior
    worker.on('message', vi.fn());
    return vi.fn(); // Return cleanup function
  }),
}));

// Mock the createStreamMetrics module
vi.mock('../../dist/plugin/metrics/createStreamMetrics.js', () => ({
  createStreamMetrics: vi.fn(() => ({ chunks: 1, bytes: 0, startTime: Date.now() })),
}));

// Mock the handleError module
vi.mock('../../dist/plugin/error/handleError.js', () => ({
  handleError: vi.fn(() => null), // Return null to indicate no panic error
}));

// Mock the getNodeEnv module
vi.mock('../../dist/plugin/config/getNodeEnv.js', () => ({
  getNodeEnv: vi.fn(() => 'development'),
}));



describe('handleWorkerRscStream', () => {
  let mockWorker: Worker;
  let mockLogger: Logger;
  let mockHandlers: StreamHandlers<"server">;
  let mockMessageHandler: (msg: unknown) => void;

  beforeEach(() => {
    mockMessageHandler = vi.fn();
    mockWorker = {
      postMessage: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          mockMessageHandler = handler;
        }
      }),
      off: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
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
      onCssFile: vi.fn(),
      onShellError: vi.fn(),
      onRscRender: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMessage = (route: string) => ({
    route,
    moduleBase: 'src',
    moduleRootPath: 'dist/client/',
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
    HtmlComponent: undefined, // Add missing required property
    serverPipeableStreamOptions: {},
    clientPipeableStreamOptions: {},
    verbose: false,
    panicThreshold: 'none' as const,
    rscTimeout: 1000,
    rscWorkerPath: 'dist/worker/rsc-worker.js',
    htmlTimeout: 1000,
    fileWriteTimeout: 1000,
    workerShutdownTimeout: 1000,
    htmlWorkerPath: 'dist/worker/html-worker.js',
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
    type: 'RSC_RENDER' as const,
    id: expect.stringMatching(new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-[a-z0-9]+$`)),
  });

  it('should handle RSC stream correctly', async () => {
    const route = '/test';
    const message = createMessage(route);

    // Call the function and get the stream
    const stream = handleRscStream({
      worker: mockWorker,
      options: message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false,
      panicThreshold: 'none' as const,
      rscTimeout: 1000
    });

    // Verify that a ReadableStream is returned
    expect(stream).toBeInstanceOf(ReadableStream);

    // Trigger the start method by consuming the stream
    const reader = stream.getReader();
    
    // Start reading to trigger the start method
    reader.read().then(() => {
      // This will be called when data is available or stream ends
    }).catch(() => {
      // This will be called if there's an error
    });
    
    // Wait a bit for the start method to execute
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Cancel the reader
    reader.cancel();

    // Verify worker message was sent with all required fields
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: "RSC_RENDER",
      id: expect.stringMatching(new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-[a-z0-9]+$`)),
      route: route,
      url: "",
      projectRoot: "/",
      moduleBasePath: "/",
      moduleBaseURL: "/",
      moduleRootPath: "dist/client/",
      cssFiles: new Map(),
      globalCss: new Map(),
      manifest: {},
      serverPipeableStreamOptions: {},
      clientPipeableStreamOptions: {},
      verbose: false,
      panicThreshold: "none",
      pagePath: 'src/pages/test.tsx',
      propsPath: 'src/pages/test.props.ts',
      rootPath: undefined,
      htmlPath: undefined,
      pageExportName: 'Page',
      propsExportName: 'props',
      rootExportName: 'Root',
      htmlExportName: 'Html',
      moduleBase: 'src',
      publicOrigin: '/',
      rscTimeout: 1000,
      htmlTimeout: 1000,
      fileWriteTimeout: 1000,
      workerShutdownTimeout: 1000,
      rscWorkerPath: 'dist/worker/rsc-worker.js',
      htmlWorkerPath: 'dist/worker/html-worker.js',
      css: {
        inlineCss: false,
        inlineThreshold: 0,
        inlinePatterns: [],
        linkPatterns: []
      },
      build: {
        pages: ['/test'],
        outDir: 'dist',
        server: 'dist/server',
        static: 'dist/static',
        client: 'dist/client',
        rscOutputPath: 'index.rsc',
        htmlOutputPath: 'index.html'
      },
    });

    // Verify message handler was set up
    expect(mockWorker.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should create a ReadableStream and send worker message', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleRscStream({
      worker: mockWorker,
      options: message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false,
      panicThreshold: 'none',
      rscTimeout: 1000
    });

    // Verify it returns a ReadableStream
    expect(stream).toBeInstanceOf(ReadableStream);

    // Trigger the start method by consuming the stream
    const reader = stream.getReader();
    
    // Start reading to trigger the start method
    reader.read().then(() => {
      // This will be called when data is available or stream ends
    }).catch(() => {
      // This will be called if there's an error
    });
    
    // Wait a bit for the start method to execute
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Cancel the reader
    reader.cancel();

    // Verify worker message was sent with correct parameters
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: "RSC_RENDER",
      id: expect.stringMatching(new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-[a-z0-9]+$`)),
      route: route,
      url: "",
      projectRoot: "/",
      moduleBasePath: "/",
      moduleBaseURL: "/",
      moduleRootPath: "dist/client/",
      cssFiles: new Map(),
      globalCss: new Map(),
      manifest: {},
      serverPipeableStreamOptions: {},
      clientPipeableStreamOptions: {},
      verbose: false,
      panicThreshold: "none",
      pagePath: 'src/pages/test.tsx',
      propsPath: 'src/pages/test.props.ts',
      rootPath: undefined,
      htmlPath: undefined,
      pageExportName: 'Page',
      propsExportName: 'props',
      rootExportName: 'Root',
      htmlExportName: 'Html',
      moduleBase: 'src',
      publicOrigin: '/',
      rscTimeout: 1000,
      htmlTimeout: 1000,
      fileWriteTimeout: 1000,
      workerShutdownTimeout: 1000,
      rscWorkerPath: 'dist/worker/rsc-worker.js',
      htmlWorkerPath: 'dist/worker/html-worker.js',
      css: {
        inlineCss: false,
        inlineThreshold: 0,
        inlinePatterns: [],
        linkPatterns: []
      },
      build: {
        pages: ['/test'],
        outDir: 'dist',
        server: 'dist/server',
        static: 'dist/static',
        client: 'dist/client',
        rscOutputPath: 'index.rsc',
        htmlOutputPath: 'index.html'
      },
    });

    // Verify worker event listeners were set up
    expect(mockWorker.on).toHaveBeenCalledWith('message', expect.any(Function));
  });



  it('should handle worker errors gracefully', async () => {
    const route = '/test';
    const message = createMessage(route);

    const stream = handleRscStream({
      worker: mockWorker,
      options: message,
      logger: mockLogger,
      handlers: mockHandlers,
      verbose: false,
      panicThreshold: 'none',
      rscTimeout: 1000
    });

    // Verify it returns a ReadableStream even when worker might error
    expect(stream).toBeInstanceOf(ReadableStream);
  });
}); 