import { PassThrough, Readable } from "node:stream";
import type { Logger } from "vite";
import type { PanicThreshold } from "../types.js";
import { handleError } from "../error/handleError.js";

export interface UnifiedStreamHandlerOptions {
  route: string;
  id: string;
  verbose?: boolean;
  logger?: Logger;
  panicThreshold?: PanicThreshold;
  timeout?: number;
  onError?: (id: string, error: Error) => void;
  onEnd?: (id: string) => void;
  onCleanup?: (id: string) => void;
  onEvent?: (event: any) => void;
}

export interface UnifiedStreamResult {
  stream: Readable;
  abort: () => void;
  cleanup: () => void;
}

export interface UnifiedMessageHandlerOptions {
  route: string;
  id: string;
  verbose?: boolean;
  logger?: Logger;
  panicThreshold?: PanicThreshold;
  onError?: (id: string, error: Error) => void;
  onEnd?: (id: string) => void;
  onCleanup?: (id: string) => void;
  onEvent?: (event: any) => void;
}

export interface UnifiedMessageHandler {
  handleMessage: (msg: any) => Promise<void>;
  cleanup: () => void;
}

/**
 * Creates a unified stream handler that consolidates common stream management patterns
 * across html-worker, rsc-worker, and react-static alternatives.
 * 
 * This handler provides:
 * - Consistent stream creation and management
 * - Unified error handling and cleanup with panic threshold support
 * - Common timeout handling
 * - Resource cleanup patterns
 * - Event emission for error handling
 * - Pass-through for metrics collection
 */
export function createUnifiedStreamHandler(options: UnifiedStreamHandlerOptions): UnifiedStreamResult {
  const { route, id, verbose, logger, panicThreshold = "none", timeout, onError, onEnd, onCleanup, onEvent } = options;
  
  // Create the main stream
  const stream = new PassThrough();
  
  // Track if stream has been aborted or cleaned up
  let isAborted = false;
  let isCleanedUp = false;
  
  // Set up timeout if provided
  let timeoutId: NodeJS.Timeout | undefined;
  if (timeout) {
    timeoutId = setTimeout(() => {
      if (!isAborted && !isCleanedUp) {
        const timeoutError = new Error(`Stream timeout after ${timeout}ms for route: ${route}`);
        if (verbose) {
          logger?.warn(`[unified-stream:${id}] ${timeoutError.message}`);
        }
        
        // Handle timeout error with panic threshold
        const panicError = handleError({
          error: timeoutError,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `Stream timeout for route: ${route}`,
        });
        
        if (panicError != null) {
          // Emit panic error event
          onEvent?.({
            type: "route.error",
            data: {
              route: route,
              error: panicError,
              isPanic: true,
              context: "stream.timeout",
            },
          });
        }
        
        onError?.(id, timeoutError);
        cleanup();
      }
    }, timeout);
  }
  
  // Unified cleanup function
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    
    if (!stream.destroyed) {
      stream.destroy();
    }
    
    onCleanup?.(id);
    
    if (verbose) {
      logger?.info(`[unified-stream:${id}] Stream cleaned up for route: ${route}`);
    }
  };
  
  // Unified abort function
  const abort = (reason?: string) => {
    if (isAborted) return;
    isAborted = true;
    
    if (verbose) {
      logger?.info(`[unified-stream:${id}] Stream aborted for route: ${route}${reason ? ` - ${reason}` : ''}`);
    }
    
    stream.emit('abort', reason);
    cleanup();
  };
  
  // Set up error handling with panic threshold support
  stream.on('error', (error) => {
    if (verbose) {
      logger?.error(`[unified-stream:${id}] Stream error for route: ${route}: ${error.message}`);
    }
    
    // Handle error with panic threshold
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: panicThreshold,
      context: `Stream error for route: ${route}`,
    });
    
    if (panicError != null) {
      // Emit panic error event
      onEvent?.({
        type: "route.error",
        data: {
          route: route,
          error: panicError,
          isPanic: true,
          context: "stream.error",
        },
      });
    }
    
    onError?.(id, error);
    cleanup();
  });
  
  // Set up end handling
  stream.on('end', () => {
    if (verbose) {
      logger?.info(`[unified-stream:${id}] Stream ended for route: ${route}`);
    }
    onEnd?.(id);
    cleanup();
  });
  
  return {
    stream,
    abort,
    cleanup,
  };
}

/**
 * Creates a unified message handler that consolidates common message handling patterns
 * across html-worker and rsc-worker.
 * 
 * This handler provides:
 * - Consistent message type routing
 * - Unified error handling with panic threshold support
 * - Standardized cleanup patterns
 * - Common logging patterns
 * - Event emission for error handling
 * - Pass-through for metrics collection
 */
export function createUnifiedMessageHandler(options: UnifiedMessageHandlerOptions): UnifiedMessageHandler {
  const { route, id, verbose, logger, panicThreshold = "none", onError, onEnd, onCleanup, onEvent } = options;
  
  // Track active operations
  const activeOperations = new Map<string, any>();
  
  // Unified cleanup function
  const cleanup = (operationId?: string) => {
    if (operationId) {
      const operation = activeOperations.get(operationId);
      if (operation) {
        if (operation.cleanup) {
          operation.cleanup();
        }
        activeOperations.delete(operationId);
      }
    } else {
      // Clean up all operations
      for (const [, operation] of activeOperations) {
        if (operation.cleanup) {
          operation.cleanup();
        }
      }
      activeOperations.clear();
    }
    
    onCleanup?.(id);
    
    if (verbose) {
      logger?.info(`[unified-message:${id}] Cleaned up${operationId ? ` operation: ${operationId}` : ' all operations'} for route: ${route}`);
    }
  };
  
  // Unified error handler with panic threshold support
  const handleLocalError = (error: Error, context?: string) => {
    const errorContext = context ? `${context} for route: ${route}` : `for route: ${route}`;
    const enhancedError = new Error(`${error.message} (${errorContext})`);
    enhancedError.stack = error.stack;
    
    if (verbose) {
      logger?.error(`[unified-message:${id}] Error ${errorContext}: ${error.message}`);
    }
    
    // Handle error with panic threshold
    const panicError = handleError({
      error: enhancedError,
      logger: logger,
      panicThreshold: panicThreshold,
      context: `Message handler error ${errorContext}`,
    });
    
    if (panicError != null) {
      // Emit panic error event
      onEvent?.({
        type: "route.error",
        data: {
          route: route,
          error: panicError,
          isPanic: true,
          context: "message.handler.error",
        },
      });
    }
    
    onError?.(id, enhancedError);
    cleanup();
  };
  
  // Message handler function
  const handleMessage = async (msg: any) => {
    try {
      if (verbose) {
        logger?.info(`[unified-message:${id}] Received message: ${msg.type} for id: ${msg.id || 'unknown'}`);
      }
      
      // Route message based on type
      switch (msg.type) {
        case 'RSC_RENDER':
        case 'HTML_RENDER':
          // Clean up any existing operation for this id
          cleanup(msg.id);
          
          // Store the operation for cleanup
          activeOperations.set(msg.id, {
            type: msg.type,
            timestamp: Date.now(),
            cleanup: () => {
              // Operation-specific cleanup can be added here
            }
          });
          break;
          
        case 'RSC_CHUNK':
        case 'HTML_CHUNK':
          // Handle chunk processing
          if (verbose) {
            logger?.info(`[unified-message:${id}] Processing ${msg.type} chunk: ${msg.chunk?.length || 0} bytes`);
          }
          break;
          
        case 'RSC_END':
        case 'HTML_COMPLETE':
          // Handle stream completion
          if (verbose) {
            logger?.info(`[unified-message:${id}] Stream completed for id: ${msg.id}`);
          }
          cleanup(msg.id);
          onEnd?.(msg.id);
          break;
          
        case 'ABORT':
          // Handle abort
          if (verbose) {
            logger?.info(`[unified-message:${id}] Aborting operation for id: ${msg.id}${msg.reason ? ` - ${msg.reason}` : ''}`);
          }
          cleanup(msg.id);
          break;
          
        case 'CLEANUP':
          // Handle cleanup
          cleanup(msg.id);
          break;
          
        case 'SHUTDOWN':
          // Handle shutdown
          if (msg.id === '*') {
            if (verbose) {
              logger?.info(`[unified-message:${id}] Shutting down all operations`);
            }
            cleanup(); // Clean up all operations
          } else {
            if (verbose) {
              logger?.info(`[unified-message:${id}] Shutting down operation: ${msg.id}`);
            }
            cleanup(msg.id);
          }
          break;
          
        default:
          if (verbose) {
            logger?.warn(`[unified-message:${id}] Unknown message type: ${msg.type}`);
          }
          break;
      }
    } catch (error) {
      handleLocalError(error instanceof Error ? error : new Error(String(error)), 'message handling');
    }
  };
  
  return {
    handleMessage,
    cleanup,
  };
}

/**
 * Creates a unified buffered stream handler that consolidates buffering patterns
 * used across react-static and worker implementations.
 * 
 * This handler provides:
 * - Consistent buffering behavior
 * - Unified stream factory pattern
 * - Standardized error handling with panic threshold support
 * - Event emission for error handling
 */
export function createUnifiedBufferedStreamHandler(
  sourceStream: Readable,
  options: UnifiedStreamHandlerOptions
) {
  const { route, id, verbose, logger, panicThreshold = "none", onError, onEvent } = options;
  
  // Buffer to store all chunks
  const chunks: Buffer[] = [];
  let isStreamEnded = false;
  let isStreamError = false;
  let streamError: Error | null = null;
  
  // Track consumers
  const consumers = new Set<PassThrough>();
  
  // Set up source stream handling
  sourceStream.on('data', (chunk: Buffer) => {
    if (verbose) {
      logger?.info(`[unified-buffered:${id}] Buffering chunk: ${chunk.length} bytes for route: ${route}`);
    }
    
    chunks.push(chunk);
    
    // Push to all active consumers immediately
    for (const consumer of consumers) {
      if (!consumer.destroyed) {
        consumer.write(chunk);
      }
    }
  });
  
  sourceStream.on('end', () => {
    if (verbose) {
      logger?.info(`[unified-buffered:${id}] Source stream ended, buffered ${chunks.length} chunks for route: ${route}`);
    }
    
    isStreamEnded = true;
    
    // End all active consumers
    for (const consumer of consumers) {
      if (!consumer.destroyed) {
        consumer.end();
      }
    }
  });
  
  sourceStream.on('error', (error: Error) => {
    if (verbose) {
      logger?.error(`[unified-buffered:${id}] Source stream error for route: ${route}: ${error.message}`);
    }
    
    isStreamError = true;
    streamError = error;
    
    // Handle error with panic threshold
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: panicThreshold,
      context: `Buffered stream source error for route: ${route}`,
    });
    
    if (panicError != null) {
      // Emit panic error event
      onEvent?.({
        type: "route.error",
        data: {
          route: route,
          error: panicError,
          isPanic: true,
          context: "buffered.stream.source.error",
        },
      });
    }
    
    // Emit error on all consumers
    for (const consumer of consumers) {
      if (!consumer.destroyed) {
        consumer.destroy(error);
      }
    }
    
    onError?.(id, error);
  });
  
  // Factory function to create new readable streams
  const createStream = (): Readable => {
    const consumer = new PassThrough();
    
    // Add to consumers set
    consumers.add(consumer);
    
    // If stream has already ended, push all buffered data and end immediately
    if (isStreamEnded) {
      if (verbose) {
        logger?.info(`[unified-buffered:${id}] Creating stream after source ended, pushing ${chunks.length} buffered chunks`);
      }
      
      for (const chunk of chunks) {
        consumer.write(chunk);
      }
      consumer.end();
    }
    
    // If stream has errored, destroy the consumer immediately
    if (isStreamError && streamError) {
      consumer.destroy(streamError);
    }
    
    // Clean up consumer when it's destroyed
    consumer.on('close', () => {
      consumers.delete(consumer);
    });
    
    return consumer;
  };
  
  return {
    createStream,
    chunks,
    isStreamEnded,
    isStreamError,
    streamError,
    consumerCount: () => consumers.size,
  };
}


