import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWorkerStream } from 'vite-plugin-react-server/client';
import type { Worker } from 'node:worker_threads';
import type { Logger } from 'vite';
import type { RscWorkerOutputMessage } from '../../dist/plugin/worker/types';
import { createInputNormalizer } from '../../dist/plugin/helpers/inputNormalizer.js';

describe('createWorkerStream', () => {
  let mockWorker: Worker;
  let mockLogger: Logger;
  let mockHandlers: any;
  let mockMessageHandler: (msg: RscWorkerOutputMessage) => void;
  let lastChunk: Uint8Array | undefined;
  const testMessage = {
    route: '/test',
    moduleBase: 'src',
    moduleRootPath: 'dist/client',
    moduleBasePath: '/',
    moduleBaseURL: '/',
    projectRoot: '/',
    publicOrigin: '/',
    pageExportName: 'default',
    propsExportName: 'default',
    pagePath: 'src/pages/test.tsx',
    propsPath: 'src/pages/test.props.ts',
    pipeableStreamOptions: {},
    verbose: true,
    css: {
      inlineCss: false,
      inlineThreshold: 4096,
      inlinePatterns: [],
      linkPatterns: []
    },
    normalizer: createInputNormalizer({
      root: '/',
      moduleBasePath: '/',
      removeExtension: true
    }),
    moduleID: (id: string) => id,
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
    mockMessageHandler = vi.fn((msg: any) => {
      switch (msg.type) {
        case 'RSC_CHUNK':
          mockHandlers.onData(msg.id, msg.chunk);
          break;
        case 'RSC_END':
          mockHandlers.onEnd(msg.id);
          break;
        case 'ERROR':
          mockHandlers.onError(msg.id, msg.error, msg.errorInfo);
          break;
        case 'RSC_METRICS':
          mockHandlers.onMetrics(msg.id, msg.metrics);
          break;
        case 'HMR_ACCEPT':
          mockHandlers.onHmrAccept(msg.id, msg.routes);
          break;
        case 'HMR_UPDATE':
          mockHandlers.onHmrUpdate(msg.id, msg.routes);
          break;
        case 'SERVER_ACTION':
          mockHandlers.onServerAction(msg.id, msg.args);
          break;
        case 'SERVER_ACTION_RESPONSE':
          mockHandlers.onServerActionResponse(msg.id, msg.result, msg.error);
          break;
        case 'CSS_FILE':
          mockHandlers.onCssFile(msg.id, msg.content);
          break;
      }
    });
    mockWorker = {
      postMessage: vi.fn((msg) => {
        if (msg.type === 'RSC_RENDER') {
          mockMessageHandler({ type: 'RSC_CHUNK', id: msg.id, chunk: new Uint8Array([]) });
        }
      }),
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          mockMessageHandler = handler;
          handler({ type: 'READY', id: '/test', env: 'test' });
          handler({ type: 'RSC_CHUNK', id: '/test', chunk: new Uint8Array([]) });
        }
      }),
      removeListener: vi.fn(),
      terminate: vi.fn(() => mockLogger.info('worker timeout')),
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
      onData: vi.fn((id, chunk) => {
        lastChunk = chunk;
      }),
      onEnd: vi.fn(),
      onMetrics: vi.fn(),
      onHmrAccept: vi.fn(),
      onHmrUpdate: vi.fn(),
      onServerAction: vi.fn(),
      onServerActionResponse: vi.fn(),
      onCssFile: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    lastChunk = undefined;
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

  it('should handle RSC chunks correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    const initialResult = await stream.next();
    expect(initialResult.value).toEqual(new Uint8Array([]));

    // Send a chunk
    const chunk = new Uint8Array([1, 2, 3]);
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];
    messageHandler({ type: 'RSC_CHUNK', id: '/test', chunk });

    // Get the chunk from the stream
    const result = await stream.next();
    expect(mockHandlers.onData).toHaveBeenCalledWith('/test', chunk);
    expect(result.value).toBeUndefined();

    // End the stream
    messageHandler({ type: 'RSC_END', id: '/test' });
    const endResult = await stream.next();
    expect(endResult.done).toBe(true);
    expect(mockHandlers.onEnd).toHaveBeenCalledWith('/test');
  });

  it('should handle server actions correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    await stream.next();
    const args = [1, 2];
    mockMessageHandler({ type: 'SERVER_ACTION', id: 'test', args });
    expect(mockHandlers.onServerAction).toHaveBeenCalledWith('test', args);

    const result = { data: 'test' };
    mockMessageHandler({ 
      type: 'SERVER_ACTION_RESPONSE', 
      id: 'test', 
      result: {
        type: 'server-action-response',
        returnValue: result
      }
    });
    expect(mockHandlers.onServerActionResponse).toHaveBeenCalledWith('test', {
      type: 'server-action-response',
      returnValue: result
    }, undefined);

    mockMessageHandler({ type: 'RSC_END', id: 'test' });
    await stream.next();
  });

  it('should handle worker timeout', async () => {
    vi.useFakeTimers();

    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    await stream.next();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('worker timeout');

    vi.useRealTimers();
  });

  it('should handle multiple RSC chunks correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    const initialResult = await stream.next();
    expect(initialResult.value).toEqual(new Uint8Array([]));

    // Send multiple chunks
    const chunks = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7, 8, 9])
    ];
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];

    for (const chunk of chunks) {
      messageHandler({ type: 'RSC_CHUNK', id: '/test', chunk });
      const result = await stream.next();
      expect(mockHandlers.onData).toHaveBeenCalledWith('/test', chunk);
      expect(result.value).toBeUndefined();
    }

    // End the stream
    messageHandler({ type: 'RSC_END', id: '/test' });
    const endResult = await stream.next();
    expect(endResult.done).toBe(true);
    expect(mockHandlers.onEnd).toHaveBeenCalledWith('/test');
  });

  it('should handle errors correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    await stream.next();

    // Send an error
    const error = new Error('Test error');
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];
    messageHandler({ 
      type: 'ERROR', 
      id: '/test', 
      error,
      errorInfo: { componentStack: 'Test stack' }
    });

    expect(mockHandlers.onError).toHaveBeenCalledWith('/test', error, { componentStack: 'Test stack' });
  });

  it('should handle metrics correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    await stream.next();

    // Send metrics
    const metrics = { chunks: 5, bytes: 100 };
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];
    messageHandler({ type: 'RSC_METRICS', id: '/test', metrics });

    expect(mockHandlers.onMetrics).toHaveBeenCalledWith('/test', metrics);
  });

  it('should handle HMR updates correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    await stream.next();

    // Send HMR update
    const routes = ['/test', '/other'];
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];
    messageHandler({ type: 'HMR_UPDATE', id: '/test', routes });

    expect(mockHandlers.onHmrUpdate).toHaveBeenCalledWith('/test', routes);
  });

  it('should handle HMR accept correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    await stream.next();

    // Send HMR accept
    const routes = ['/test', '/other'];
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];
    messageHandler({ type: 'HMR_ACCEPT', id: '/test', routes });

    expect(mockHandlers.onHmrAccept).toHaveBeenCalledWith('/test', routes);
  });

  it('should handle CSS files correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    await stream.next();

    // Send CSS file
    const cssContent = '.test { color: red; }';
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];
    messageHandler({ type: 'CSS_FILE', id: '/test', content: cssContent });

    expect(mockHandlers.onCssFile).toHaveBeenCalledWith('/test', cssContent);
  });

  it('should handle server actions correctly', async () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    await stream.next();

    // Send server action
    const args = [1, 2, 3];
    const messageHandler = (mockWorker.on as any).mock.calls[0][1];
    messageHandler({ type: 'SERVER_ACTION', id: '/test', args });

    expect(mockHandlers.onServerAction).toHaveBeenCalledWith('/test', args);

    // Send server action response
    const result = { data: 'test' };
    messageHandler({ 
      type: 'SERVER_ACTION_RESPONSE', 
      id: '/test', 
      result,
      error: undefined
    });

    expect(mockHandlers.onServerActionResponse).toHaveBeenCalledWith('/test', result, undefined);
  });

  it('should handle worker timeout with cleanup', async () => {
    vi.useFakeTimers();

    const stream = createWorkerStream({
      worker: mockWorker,
      message: testMessage,
      logger: mockLogger,
      handlers: mockHandlers,
    });

    // Wait for initial empty chunk
    await stream.next();

    // Advance timers to trigger timeout
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('worker timeout');

    // Wait for stream to complete
    const result = await stream.next();
    expect(result.done).toBe(true);

    // Verify cleanup
    expect(mockWorker.removeListener).toHaveBeenCalled();

    vi.useRealTimers();
  });
}); 