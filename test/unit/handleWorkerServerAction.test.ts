import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleWorkerServerAction } from '../../dist/plugin/react-client/handleWorkerServerAction.js';
import type { Worker } from 'node:worker_threads';
import type { Logger } from 'vite';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'events';
import { createServerActionStream } from '../../dist/plugin/helpers/handleServerAction.js';

// Mock the handleServerAction module
vi.mock('../../dist/plugin/helpers/handleServerAction.js', () => ({
  parseServerActionRequest: vi.fn((body, url) => {
    const data = JSON.parse(body);
    if (Array.isArray(data)) {
      return {
        id: url?.split("#")[1] ?? "",
        args: data
      };
    } else if (data && typeof data === "object" && "id" in data) {
      return {
        id: data.id,
        args: data.args ?? []
      };
    }
    throw new Error("Invalid server action request format");
  }),
  setupServerActionHeaders: vi.fn((res) => {
    res.setHeader('Content-Type', 'text/x-component; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
  }),
  createServerActionStream: vi.fn((res) => {
    const stream = new PassThrough();
    stream.pipe(res, { end: true });
    stream.on('end', () => {
      res.end();
    });
    return stream;
  }),
  handleServerActionError: vi.fn((error, res, logger) => {
    logger.error(error);
    res.end();
  })
}));

// Mock the logError module
vi.mock('../../dist/plugin/error/logError.js', () => ({
  logError: vi.fn((error, logger) => {
    logger.error(error);
  })
}));

describe('handleWorkerServerAction', () => {
  let mockWorker: Worker;
  let mockLogger: Logger;
  let mockReq: any;
  let mockRes: any;
  let mockPassThrough: PassThrough;

  beforeEach(() => {
    const mockOn = vi.fn();
    const mockPostMessage = vi.fn();
    const mockRemoveListener = vi.fn();

    mockWorker = {
      postMessage: mockPostMessage,
      on: mockOn,
      removeListener: mockRemoveListener,
      // Add required Worker properties
      stdin: null,
      stdout: null,
      stderr: null,
      threadId: 1,
      resourceLimits: {},
      performance: {} as any,
      terminate: vi.fn(),
      ref: vi.fn(),
      unref: vi.fn(),
      addListener: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      removeAllListeners: vi.fn(),
      setMaxListeners: vi.fn(),
      getMaxListeners: vi.fn(),
      listeners: vi.fn(),
      rawListeners: vi.fn(),
      emit: vi.fn(),
      listenerCount: vi.fn(),
      prependListener: vi.fn(),
      prependOnceListener: vi.fn(),
      eventNames: vi.fn(),
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

    mockReq = {
      url: '/api/action#test-action',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({ id: 'test-action', args: [1, 2] }));
      }
    };

    // Create a mock response that implements the stream interface
    mockRes = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      listeners: vi.fn(),
      rawListeners: vi.fn(),
      getMaxListeners: vi.fn(),
      setMaxListeners: vi.fn(),
      emit: vi.fn(),
      listenerCount: vi.fn(),
      prependListener: vi.fn(),
      prependOnceListener: vi.fn(),
      eventNames: vi.fn(),
      statusCode: 200,
    });

    // Create a real PassThrough stream for testing
    mockPassThrough = new PassThrough();
    mockPassThrough.pipe(mockRes, { end: true });
    mockPassThrough.on('end', () => {
      mockRes.end();
    });

    // Mock createServerActionStream to return our mockPassThrough
    vi.mocked(createServerActionStream).mockReturnValue(mockPassThrough);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle server action request correctly', async () => {
    await handleWorkerServerAction(mockReq, mockRes, mockWorker, mockLogger);

    // Verify worker message was sent
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'SERVER_ACTION',
      id: 'test-action',
      args: [1, 2],
    });

    // Verify headers were set correctly for RSC
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/x-component; charset=utf-8');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Transfer-Encoding', 'chunked');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');

    // Verify message handler was set up
    expect(mockWorker.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should handle RSC chunks correctly', async () => {
    const messageHandler = vi.fn();
    (mockWorker.on as any).mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler(handler);
      }
    });

    await handleWorkerServerAction(mockReq, mockRes, mockWorker, mockLogger);

    const handler = messageHandler.mock.calls[0][0];
    const chunk = Buffer.from([1, 2, 3]);
    handler({ type: 'RSC_CHUNK', id: 'test-action', chunk });

    // The chunk should be written to the response through the pass-through stream
    expect(mockRes.write).toHaveBeenCalledWith(chunk);
  });

  it('should handle RSC end correctly', async () => {
    const messageHandler = vi.fn();
    (mockWorker.on as any).mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler(handler);
      }
    });

    await handleWorkerServerAction(mockReq, mockRes, mockWorker, mockLogger);

    const handler = messageHandler.mock.calls[0][0];
    handler({ type: 'RSC_END', id: 'test-action' });

    // Wait for stream to finish
    await new Promise(resolve => setTimeout(resolve, 0));

    // The stream should be ended and the message handler removed
    expect(mockRes.end).toHaveBeenCalled();
    expect(mockWorker.removeListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should handle errors correctly', async () => {
    const messageHandler = vi.fn();
    (mockWorker.on as any).mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler(handler);
      }
    });

    await handleWorkerServerAction(mockReq, mockRes, mockWorker, mockLogger);

    const handler = messageHandler.mock.calls[0][0];
    const error = new Error('Test error');
    handler({ type: 'ERROR', id: 'test-action', error });

    // Wait for stream to finish
    await new Promise(resolve => setTimeout(resolve, 0));

    // The stream should be ended, message handler removed, and error logged
    expect(mockRes.end).toHaveBeenCalled();
    expect(mockWorker.removeListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockLogger.error).toHaveBeenCalledWith(error);
  });

  it('should handle stream errors correctly', async () => {
    const messageHandler = vi.fn();
    (mockWorker.on as any).mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler(handler);
      }
    });

    await handleWorkerServerAction(mockReq, mockRes, mockWorker, mockLogger);

    // Simulate a stream error
    mockPassThrough.emit('error', new Error('Stream error'));

    // Wait for stream to finish
    await new Promise(resolve => setTimeout(resolve, 0));

    // The stream should be ended, message handler removed, and error logged
    expect(mockRes.end).toHaveBeenCalled();
    expect(mockWorker.removeListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should handle invalid request body', async () => {
    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from('invalid json');
    };

    await handleWorkerServerAction(mockReq, mockRes, mockWorker, mockLogger);


    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should handle missing action ID', async () => {
    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify({ args: [1, 2] }));
    };

    await handleWorkerServerAction(mockReq, mockRes, mockWorker, mockLogger);


    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });
}); 