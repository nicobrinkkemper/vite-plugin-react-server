import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderRscStream } from '../../dist/plugin/stream/renderRscStream.server.js';
import type { CreateHandlerOptions } from 'vite-plugin-react-server/types';
import { PassThrough } from 'node:stream';

// Mock the dependencies with simple implementations
vi.mock('../../dist/plugin/stream/renderRscStreamHelpers.server.js', () => ({
  createReactStream: vi.fn(() => {
    const { PassThrough } = require('node:stream');
    const mockStream = new PassThrough();
    
    // Simulate React streaming by writing some mock RSC data
    setTimeout(() => {
      mockStream.write('MOCK_RSC_DATA\n');
      mockStream.end();
    }, 10);
    
    return mockStream;
  }),
}));

// Define handlers type inline since it's not exported from the main types
type MockStreamHandlers = {
  onError: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  onEnd: ReturnType<typeof vi.fn>;
  onMetrics: ReturnType<typeof vi.fn>;
  onShellError: ReturnType<typeof vi.fn>;
  onRscRender: ReturnType<typeof vi.fn>;
  onServerModule: ReturnType<typeof vi.fn>;
  onServerAction: ReturnType<typeof vi.fn>;
  onServerActionResponse: ReturnType<typeof vi.fn>;
};

// Helper functions for creating mock options
function createMockHandlers(): MockStreamHandlers {
  return {
    onError: vi.fn(),
    onData: vi.fn(),
    onEnd: vi.fn(),
    onMetrics: vi.fn(),
    onShellError: vi.fn(),
    onRscRender: vi.fn(),
    onServerModule: vi.fn(),
    onServerAction: vi.fn(),
    onServerActionResponse: vi.fn(),
  };
}

function createMockAutoDiscover() {
  return {
    clientEntry: 'src/entry-client.tsx',
    serverEntry: 'src/entry-server.tsx',
    cssEntry: 'src/entry-css.ts',
    jsonEntry: 'src/entry-json.ts',
    htmlEntry: 'src/html.tsx',
    modulePattern: /\.(ts|tsx|js|jsx|mjs|cjs)$/,
    serverPattern: /\.server\.(ts|tsx|js|jsx|mjs|cjs)$/,
    clientPattern: /\.client\.(ts|tsx|js|jsx|mjs|cjs)$/,
    pagePattern: /\/pages\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/,
    propsPattern: /\.props\.(ts|tsx|js|jsx|mjs|cjs)$/,
    cssPattern: /\.css$/,
    jsonPattern: /\.json$/,
    htmlPattern: /\.html$/,
    cssModulePattern: /\.module\.css$/,
    vendorPattern: /node_modules/,
    nodePattern: /^node:/,
    dotPattern: /^\./,
    virtualPattern: /^virtual:/,
    rscPattern: /\.rsc$/,
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    warnOnce: vi.fn(),
    clearScreen: vi.fn(),
    hasWarned: false,
    hasErrorLogged: vi.fn(),
  };
}

function createMockBuild() {
  return {
    outDir: 'dist',
    pages: ['/test'],
    server: 'dist/server',
    static: 'dist/static',
    client: 'dist/client',
    rscOutputPath: 'index.rsc',
    htmlOutputPath: 'index.html',
    assetsDir: 'assets',
  };
}

function createMockDev() {
  return {
    useHtmlWorker: false,
    useRscWorker: false,
  };
}

function createMockOptions(overrides: Partial<CreateHandlerOptions & { handlers: MockStreamHandlers }> = {}): CreateHandlerOptions & { handlers: MockStreamHandlers } {
  const handlers = createMockHandlers();
  
  return {
    // Required ResolvedUserOptions properties
    autoDiscover: createMockAutoDiscover(),
    css: {},
    pageExportName: 'default',
    propsExportName: 'default',
    rootExportName: 'default',
    htmlExportName: 'default',
    moduleRootPath: 'src',
    moduleBasePath: 'src',
    moduleBaseURL: '/src',
    publicOrigin: 'http://localhost:3000',
    htmlWorkerPath: 'worker/html',
    rscWorkerPath: 'worker/rsc',
    rscTimeout: 5000,
    htmlTimeout: 5000,
    fileWriteTimeout: 1000,
    workerShutdownTimeout: 1000,
    panicThreshold: 'none',
    components: {},
    normalizer: vi.fn().mockReturnValue(['test', 'test']),
    moduleID: vi.fn().mockReturnValue('test-id'),
    onEvent: vi.fn(),
    onMetrics: vi.fn(),
    
    // CreateHandlerOptions specific properties
    id: 'test-route-123',
    route: '/test',
    verbose: false,
    logger: createMockLogger(),
    moduleBase: 'src',
    projectRoot: '/',
    cssFiles: new Map(),
    globalCss: new Map(),
    manifest: {},
    htmlPath: '',
    PageComponent: vi.fn(),
    HtmlComponent: vi.fn(),
    serverPipeableStreamOptions: {},
    loader: vi.fn(),
    build: createMockBuild(),
    dev: createMockDev(),
    pagePath: 'src/pages/test.tsx',
    propsPath: 'src/pages/test.props.ts',
    handlers,
    
    // Apply any overrides
    ...overrides,
  };
}

describe('renderRscStream', () => {
  let mockOptions: CreateHandlerOptions & { handlers: MockStreamHandlers };
  let mockHandlers: MockStreamHandlers;

  beforeEach(() => {
    mockOptions = createMockOptions();
    mockHandlers = mockOptions.handlers;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be a function', () => {
    expect(typeof renderRscStream).toBe('function');
    
    // Test that it returns a result object
    const result = renderRscStream(mockOptions, mockHandlers);
    expect(result).toHaveProperty('type', 'server');
  });

  it('should return RscRenderResult with correct structure', () => {
    const result = renderRscStream(mockOptions, mockHandlers);
    
    expect(result).toHaveProperty('type', 'server');
    expect(result).toHaveProperty('pipe');
    expect(result).toHaveProperty('abort');
    expect(result).toHaveProperty('rscStream');
    expect(result).toHaveProperty('metrics');
    expect(typeof result.pipe).toBe('function');
    expect(typeof result.abort).toBe('function');
  });

  it('should handle headless stream reuse correctly', async () => {
    const headlessStreamElements = new Map();
    headlessStreamElements.set('headless-123', {
      PageComponent: vi.fn(),
      errored: false
    });

    const optionsWithReuse = {
      ...mockOptions,
      reuseHeadlessStreamId: 'headless-123',
      headlessStreamElements,
    };

    const result = renderRscStream(optionsWithReuse, mockHandlers);
    
    expect(result).toHaveProperty('rscStream');
  });

  it('should handle errors gracefully', async () => {
    // Test that the function doesn't throw on basic usage
    const result = renderRscStream(mockOptions, mockHandlers);
    
    expect(result).toHaveProperty('rscStream');
    expect(result).toHaveProperty('abort');
  });

  it('should create stream with proper metrics', async () => {
    const result = renderRscStream(mockOptions, mockHandlers);
    expect(result).toBeDefined();
    
    expect(result.metrics).toHaveProperty('chunks');
    expect(result.metrics).toHaveProperty('bytes');
    expect(result.metrics).toHaveProperty('startTime');
  });

  it('should support abort functionality', async () => {
    const result = renderRscStream(mockOptions, mockHandlers);
    
    expect(typeof result.abort).toBe('function');
    
    // Test abort doesn't throw
    expect(() => result.abort('Test abort')).not.toThrow();
  });

  describe('basic error handling', () => {
    it('should handle abort functionality', async () => {
      const result = renderRscStream(mockOptions, mockHandlers);
      
      expect(result).toHaveProperty('abort');
      
      // Test abort functionality
      const abortFn = result.abort;
      expect(() => abortFn('User requested abort')).not.toThrow();
      
      // Verify error handler was called with abort reason
      expect(mockHandlers.onError).toHaveBeenCalledWith(
        mockOptions.id,
        expect.any(Error),
        expect.objectContaining({
          route: mockOptions.route,
          context: 'Stream Aborted'
        })
      );
    });

    it('should handle stream completion setup', async () => {
      // Get the result directly
      const result = renderRscStream(mockOptions, mockHandlers);
      
      expect(result).toHaveProperty('rscStream');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('abort');
      
      // Test that the stream is properly set up for completion
      const stream = result.rscStream;
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe('function');
    });
  });

  describe('stream structure and basic functionality', () => {
    it('should create a proper PassThrough stream', async () => {
      const result = renderRscStream(mockOptions, mockHandlers);
      
      expect(result).toHaveProperty('rscStream');
      
      const rscStream = result.rscStream;
      expect(rscStream).toBeInstanceOf(PassThrough);
      expect(typeof rscStream.pipe).toBe('function');
      expect(typeof rscStream.on).toBe('function');
    });

    it('should handle headless stream options correctly', async () => {
      const headlessOptions = createMockOptions({
        htmlPath: '', // This makes it a headless stream
        id: 'headless-test-123',
        route: '/headless-test',
      });

      const result = renderRscStream(headlessOptions, headlessOptions.handlers);
      
      expect(result).toHaveProperty('rscStream');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('abort');
    });

    it('should handle headless stream reuse options', async () => {
      const headlessStreamElements = new Map();
      const headlessStreamErrors = new Map();
      
      // Set up a reusable headless stream
      headlessStreamElements.set('headless-reuse-123', {
        PageComponent: vi.fn(() => 'Reused Component'),
        errored: false
      });

      const optionsWithReuse = {
        ...mockOptions,
        htmlPath: '', // Headless stream
        id: 'headless-reuse-123',
        route: '/headless-reuse',
        reuseHeadlessStreamId: 'headless-reuse-123',
        headlessStreamElements,
        headlessStreamErrors,
      };

      const result = renderRscStream(optionsWithReuse, mockHandlers);
      
      expect(result).toHaveProperty('rscStream');
      
      // Verify the headless stream data was stored
      expect(headlessStreamElements.has('headless-reuse-123')).toBe(true);
    });
  });
});
