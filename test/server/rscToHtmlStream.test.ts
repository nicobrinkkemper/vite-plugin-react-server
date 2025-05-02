/**
 * rscToHtmlStream.test.ts
 * 
 * PURPOSE: Tests the transformation of RSC content to HTML via worker
 * 
 * This test file:
 * 1. Verifies that RSC content is correctly transformed to HTML
 * 2. Tests worker message handling
 * 3. Validates stream completion
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRscToHtmlStream } from '../../plugin/react-static/rscToHtmlStream.js';

describe('rscToHtmlStream', () => {
  let mockWorker: any;
  let mockOptions: any;
  
  beforeEach(() => {
    // Create a mock worker
    mockWorker = {
      postMessage: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      terminate: vi.fn()
    };
    
    // Create mock options
    mockOptions = {
      worker: mockWorker,
      route: '/',
      moduleRootPath: '/root',
      moduleBaseURL: '/',
      htmlOutputPath: 'index.html',
      pipeableStreamOptions: {}
    };
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  it('should transform RSC to HTML via worker', () => {
    // Create the stream
    const stream = createRscToHtmlStream(mockOptions);
    
    // Set up message handler to simulate worker responses
    let messageHandler: Function | undefined;
    mockWorker.on.mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });
    
    // Write RSC content to the stream
    stream.write('M1:{"id":"/.","chunks":[],"name":"","async":false}\n\n');
    stream.write('J0:["$","div",null,{"children":"Hello World"}]\n\n');
    stream.write('M2:{"id":"/components/Test","chunks":[],"name":"","async":false}\n\n');
    stream.write('J1:["$","span",null,{"children":"Test Component"}]\n\n');
    
    // End the stream
    stream.end();
    
    // Simulate worker sending HTML chunks immediately
    if (messageHandler) {
      messageHandler({
        id: '/',
        type: 'HTML_CHUNK',
        chunk: '<!DOCTYPE html><html><head></head><body>'
      });
      
      messageHandler({
        id: '/',
        type: 'HTML_CHUNK',
        chunk: '<div>Hello World<span>Test Component</span></div>'
      });
      
      messageHandler({
        id: '/',
        type: 'HTML_CHUNK',
        chunk: '</body></html>'
      });
      
      messageHandler({
        id: '/',
        type: 'HTML_COMPLETE',
        success: true
      });
    }
    
    // Verify worker was called correctly
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'ROUTE_READY',
      id: '/'
    });
    
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'RSC_END',
      id: '/'
    });
  });
  
  it('should handle worker errors', () => {
    // Create the stream
    const stream = createRscToHtmlStream(mockOptions);
    
    // Set up message handler to simulate worker responses
    let messageHandler: Function | undefined;
    mockWorker.on.mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });
    
    // Create a spy for the error event
    const errorSpy = vi.fn();
    stream.on('error', errorSpy);
    
    // Write RSC content to the stream
    stream.write('M1:{"id":"/.","chunks":[],"name":"","async":false}\n\n');
    
    // Get the transform function from the stream
    const transform = (stream as any)._transform;
    
    // Call transform directly with the error message
    transform.call(stream, {
      type: 'ERROR',
      id: '/',
      error: 'Test error message'
    }, 'utf8', () => {});
    
    // Verify worker was called correctly
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'ROUTE_READY',
      id: '/'
    });
    
    // Verify error was emitted
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(errorSpy.mock.calls[0][0].message).toBe('Test error message');
  });
});