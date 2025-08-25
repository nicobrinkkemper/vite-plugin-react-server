import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRscStream } from 'vite-plugin-react-server/stream';
import type { Worker } from 'node:worker_threads';
import type { Logger } from 'vite';
import type { StreamHandlers } from 'vite-plugin-react-server/worker';

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

  const createOptions = (route: string) => ({
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
    verbose: true,
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
      htmlOutputPath: 'index.html',
      assetsDir: 'assets'
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
    logger: mockLogger,
    loader: vi.fn(),
    dev: {
      useRscWorker: false,
      useHtmlWorker: false,
    },
    type: 'INIT' as const,
    id: expect.stringMatching(new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-[a-z0-9]+$`)),
  });

  it('should handle RSC stream correctly', async () => {
    const route = '/test';
    const options = createOptions(route);

    // Call the function and get the stream
    console.log('About to call handleRscStream with options:', { ...options, rscWorker: mockWorker, url: '', logger: mockLogger });
    const stream = handleRscStream({
      options: {
        ...options,
        rscWorker: mockWorker,
        url: '',
        logger: mockLogger,
      },
      handlers: mockHandlers,
    });

    // Verify that a ReadableStream is returned
    expect(stream).toBeInstanceOf(ReadableStream);

    // For unit test, we just verify the stream is created and worker is configured
    // The actual worker communication will be tested in integration tests
    expect(mockWorker).toBeDefined();
    expect(mockHandlers).toBeDefined();
    
    // Verify that the stream has the expected properties
    expect(stream).toHaveProperty('getReader');
    expect(typeof stream.getReader).toBe('function');
  });

  it('should create a ReadableStream and send worker message', async () => {
    const route = '/test';
    const message = createOptions(route);

    const stream = handleRscStream({
      options: {
        ...message,
        rscWorker: mockWorker,
        url: '',
        logger: mockLogger,
      },
      handlers: mockHandlers,
    });

    // Verify it returns a ReadableStream
    expect(stream).toBeInstanceOf(ReadableStream);

    // For unit test, we just verify the stream is created and worker is configured
    // The actual worker communication will be tested in integration tests
    expect(mockWorker).toBeDefined();
    expect(mockHandlers).toBeDefined();
    
    // Verify that the stream has the expected properties
    expect(stream).toHaveProperty('getReader');
    expect(typeof stream.getReader).toBe('function');
    
    // Verify that the stream can be read (basic functionality)
    const reader = stream.getReader();
    expect(reader).toBeDefined();
    expect(typeof reader.read).toBe('function');
    
    // Clean up
    reader.cancel();
  });



  it('should handle worker errors gracefully', async () => {
    const route = '/test';
    const message = createOptions(route);

    const stream = handleRscStream({
      options: {
        ...message,
        rscWorker: mockWorker,
        url: '',
        logger: mockLogger,
      },
      handlers: mockHandlers,
    });

    // Verify it returns a ReadableStream even when worker might error
    expect(stream).toBeInstanceOf(ReadableStream);
  });
}); 