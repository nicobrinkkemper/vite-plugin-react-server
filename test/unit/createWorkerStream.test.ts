import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWorkerStream } from 'vite-plugin-react-server/helpers';
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
    serverPipeableStreamOptions: {},
    clientPipeableStreamOptions: {},
    verbose: false,
    panicThreshold: 'none',
    rscTimeout: 1000,
    rscWorkerPath: 'dist/worker/rsc-worker.js',
    htmlTimeout: 1000,
    fileWriteTimeout: 1000,
    workerShutdownTimeout: 1000,
    htmlWorkerPath: '',
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
      off: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
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
      onShellError: vi.fn(),
      onRscRender: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });


  it('should create a readable stream', () => {
    const stream = createWorkerStream({
      worker: mockWorker,
      route: testMessage.route,
      url: testMessage.url || '',
      projectRoot: testMessage.projectRoot || '',
      moduleBasePath: testMessage.moduleBasePath || '',
      moduleBaseURL: testMessage.moduleBaseURL || '',
      moduleRootPath: testMessage.moduleRootPath || '',
      cssFiles: testMessage.cssFiles || new Map(),
      globalCss: testMessage.globalCss || new Map(),
      manifest: testMessage.manifest || {},
      serverPipeableStreamOptions: testMessage.serverPipeableStreamOptions || {},
      clientPipeableStreamOptions: testMessage.clientPipeableStreamOptions || {},
      verbose: testMessage.verbose || false,
      panicThreshold: testMessage.panicThreshold || 'none',
      logger: mockLogger,
      workerPath: testMessage.rscWorkerPath || '',
      messageType: 'RSC_RENDER',
      currentCondition: 'react-server',
      reverseCondition: 'react-client',
      pagePath: testMessage.pagePath,
      propsPath: testMessage.propsPath,
      rootPath: testMessage.rootPath,
      htmlPath: testMessage.htmlPath,
      pageExportName: testMessage.pageExportName,
      propsExportName: testMessage.propsExportName,
      rootExportName: testMessage.rootExportName,
      htmlExportName: testMessage.htmlExportName,
      moduleBase: testMessage.moduleBase,
      publicOrigin: testMessage.publicOrigin,
      rscTimeout: testMessage.rscTimeout,
      htmlTimeout: testMessage.htmlTimeout,
      fileWriteTimeout: testMessage.fileWriteTimeout,
      workerShutdownTimeout: testMessage.workerShutdownTimeout,
      rscWorkerPath: testMessage.rscWorkerPath,
      htmlWorkerPath: testMessage.htmlWorkerPath,
      css: testMessage.css,
      build: testMessage.build,
    });

    // Verify the stream is a readable stream
    expect(typeof stream.read).toBe('function');
    expect(typeof stream.pipe).toBe('function');
    expect(typeof stream.on).toBe('function');
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
      off: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    const stream = createWorkerStream({
      worker: responsiveWorker,
      route: testMessage.route,
      url: testMessage.url || '',
      projectRoot: testMessage.projectRoot || '',
      moduleBasePath: testMessage.moduleBasePath || '',
      moduleBaseURL: testMessage.moduleBaseURL || '',
      moduleRootPath: testMessage.moduleRootPath || '',
      cssFiles: testMessage.cssFiles || new Map(),
      globalCss: testMessage.globalCss || new Map(),
      manifest: testMessage.manifest || {},
      serverPipeableStreamOptions: testMessage.serverPipeableStreamOptions || {},
      clientPipeableStreamOptions: testMessage.clientPipeableStreamOptions || {},
      verbose: testMessage.verbose || false,
      panicThreshold: testMessage.panicThreshold || 'none',
      logger: mockLogger,
      workerPath: testMessage.rscWorkerPath || '',
      messageType: 'RSC_RENDER',
      currentCondition: 'react-server',
      reverseCondition: 'react-client',
      pagePath: testMessage.pagePath,
      propsPath: testMessage.propsPath,
      rootPath: testMessage.rootPath,
      htmlPath: testMessage.htmlPath,
      pageExportName: testMessage.pageExportName,
      propsExportName: testMessage.propsExportName,
      rootExportName: testMessage.rootExportName,
      htmlExportName: testMessage.htmlExportName,
      moduleBase: testMessage.moduleBase,
      publicOrigin: testMessage.publicOrigin,
      rscTimeout: testMessage.rscTimeout,
      htmlTimeout: testMessage.htmlTimeout,
      fileWriteTimeout: testMessage.fileWriteTimeout,
      workerShutdownTimeout: testMessage.workerShutdownTimeout,
      rscWorkerPath: testMessage.rscWorkerPath,
      htmlWorkerPath: testMessage.htmlWorkerPath,
      css: testMessage.css,
      build: testMessage.build,
    });

    // Verify worker.postMessage was called with all required fields
    expect(responsiveWorker.postMessage).toHaveBeenCalledWith({
      type: 'RSC_RENDER',
      id: '/test',
      route: '/test',
      url: '',
      projectRoot: '/',
      moduleBasePath: '/',
      moduleBaseURL: '/',
      moduleRootPath: 'dist/client/',
      cssFiles: new Map(),
      globalCss: new Map(),
      manifest: {},
      serverPipeableStreamOptions: {},
      clientPipeableStreamOptions: {},
      verbose: false,
      panicThreshold: 'none',
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
      htmlWorkerPath: '',
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
    });

    // Verify the stream was created
    expect(stream).toBeDefined();
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
              error: new Error('createWorkerStream.test.ts Worker error'),
              errorInfo: { componentStack: 'test stack' }
            });
            messageHandler({ type: 'RSC_END', id: '/test' });
          }
        }
      }),
      off: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    const stream = createWorkerStream({
      worker: errorWorker,
      route: testMessage.route,
      url: testMessage.url || '',
      projectRoot: testMessage.projectRoot || '',
      moduleBasePath: testMessage.moduleBasePath || '',
      moduleBaseURL: testMessage.moduleBaseURL || '',
      moduleRootPath: testMessage.moduleRootPath || '',
      cssFiles: testMessage.cssFiles || new Map(),
      globalCss: testMessage.globalCss || new Map(),
      manifest: testMessage.manifest || {},
      serverPipeableStreamOptions: testMessage.serverPipeableStreamOptions || {},
      clientPipeableStreamOptions: testMessage.clientPipeableStreamOptions || {},
      verbose: testMessage.verbose || false,
      panicThreshold: testMessage.panicThreshold || 'none',
      logger: mockLogger,
      workerPath: testMessage.rscWorkerPath || '',
      messageType: 'RSC_RENDER',
      currentCondition: 'react-server',
      reverseCondition: 'react-client',
      pagePath: testMessage.pagePath,
      propsPath: testMessage.propsPath,
      rootPath: testMessage.rootPath,
      htmlPath: testMessage.htmlPath,
      pageExportName: testMessage.pageExportName,
      propsExportName: testMessage.propsExportName,
      rootExportName: testMessage.rootExportName,
      htmlExportName: testMessage.htmlExportName,
      moduleBase: testMessage.moduleBase,
      publicOrigin: testMessage.publicOrigin,
      rscTimeout: testMessage.rscTimeout,
      htmlTimeout: testMessage.htmlTimeout,
      fileWriteTimeout: testMessage.fileWriteTimeout,
      workerShutdownTimeout: testMessage.workerShutdownTimeout,
      rscWorkerPath: testMessage.rscWorkerPath,
      htmlWorkerPath: testMessage.htmlWorkerPath,
      css: testMessage.css,
      build: testMessage.build,
    });

    // Verify the stream was created and error handling was set up
    expect(stream).toBeDefined();
    expect(errorWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
    
    // The stream should emit an error when it receives an ERROR message
    await expect(new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('end', resolve);
    })).rejects.toThrow('createWorkerStream.test.ts Worker error');
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
      off: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    const stream = createWorkerStream({
      worker: multiChunkWorker,
      route: testMessage.route,
      url: testMessage.url || '',
      projectRoot: testMessage.projectRoot || '',
      moduleBasePath: testMessage.moduleBasePath || '',
      moduleBaseURL: testMessage.moduleBaseURL || '',
      moduleRootPath: testMessage.moduleRootPath || '',
      cssFiles: testMessage.cssFiles || new Map(),
      globalCss: testMessage.globalCss || new Map(),
      manifest: testMessage.manifest || {},
      serverPipeableStreamOptions: testMessage.serverPipeableStreamOptions || {},
      clientPipeableStreamOptions: testMessage.clientPipeableStreamOptions || {},
      verbose: testMessage.verbose || false,
      panicThreshold: testMessage.panicThreshold || 'none',
      logger: mockLogger,
      workerPath: testMessage.rscWorkerPath || '',
      messageType: 'RSC_RENDER',
      currentCondition: 'react-server',
      reverseCondition: 'react-client',
      pagePath: testMessage.pagePath,
      propsPath: testMessage.propsPath,
      rootPath: testMessage.rootPath,
      htmlPath: testMessage.htmlPath,
      pageExportName: testMessage.pageExportName,
      propsExportName: testMessage.propsExportName,
      rootExportName: testMessage.rootExportName,
      htmlExportName: testMessage.htmlExportName,
      moduleBase: testMessage.moduleBase,
      publicOrigin: testMessage.publicOrigin,
      rscTimeout: testMessage.rscTimeout,
      htmlTimeout: testMessage.htmlTimeout,
      fileWriteTimeout: testMessage.fileWriteTimeout,
      workerShutdownTimeout: testMessage.workerShutdownTimeout,
      rscWorkerPath: testMessage.rscWorkerPath,
      htmlWorkerPath: testMessage.htmlWorkerPath,
      css: testMessage.css,
      build: testMessage.build,
    });

    // Verify the stream was created
    expect(stream).toBeDefined();
  });
}); 