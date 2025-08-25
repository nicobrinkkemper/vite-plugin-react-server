import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";
import type { Logger } from "vite";
import type { PanicThreshold } from "../types.js";
import { handleError } from "../error/handleError.js";

export type StreamType = "rsc" | "html";
export type RscVariant = "rsc-headless" | "rsc-full";

export interface UnifiedStreamHandlerOptions {
  route: string;
  id: string;
  streamType: StreamType;
  rscVariant?: RscVariant; // Only used when streamType is "rsc"
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
  stream: Readable | PassThrough;
  abort: () => void;
  cleanup: () => void;
  streamType: StreamType;
  rscVariant?: RscVariant;
}

export interface UnifiedMessageHandlerOptions {
  route: string;
  id: string;
  streamType: StreamType;
  rscVariant?: RscVariant; // Only used when streamType is "rsc"
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
 * - Stream type awareness (RSC vs HTML)
 */
export function createUnifiedStreamHandler(options: UnifiedStreamHandlerOptions): UnifiedStreamResult {
  const { route, id, streamType, rscVariant, verbose, logger, panicThreshold = "none", timeout, onError, onEnd, onCleanup, onEvent } = options;
  
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
        const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
        const timeoutError = new Error(`${streamLabel} stream timeout after ${timeout}ms for route: ${route}`);
        if (verbose) {
          logger?.warn(`[unified-stream:${id}] ${timeoutError.message}`);
        }
        
        // Handle timeout error with panic threshold
        const panicError = handleError({
          error: timeoutError,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `${streamLabel} stream timeout for route: ${route}`,
        });
        
        if (panicError != null) {
          // Emit panic error event
          onEvent?.({
            type: "route.error",
            data: {
              route: route,
              error: panicError,
              isPanic: true,
              context: `${streamType === "rsc" && rscVariant ? rscVariant : streamType}.stream.timeout`,
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
      const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
      logger?.info(`[unified-stream:${id}] ${streamLabel} stream cleaned up for route: ${route}`);
    }
  };
  
  // Unified abort function
  const abort = (reason?: string) => {
    if (isAborted) return;
    isAborted = true;
    
    if (verbose) {
      const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
      logger?.info(`[unified-stream:${id}] ${streamLabel} stream aborted for route: ${route}${reason ? ` - ${reason}` : ''}`);
    }
    
    stream.emit('abort', reason);
    cleanup();
  };
  
  // Set up error handling with panic threshold support
  stream.on('error', (error) => {
    const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
    if (verbose) {
      logger?.error(`[unified-stream:${id}] ${streamLabel} stream error for route: ${route}: ${error.message}`);
    }
    
    // Handle error with panic threshold
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: panicThreshold,
      context: `${streamLabel} stream error for route: ${route}`,
    });
    
    if (panicError != null) {
      // Emit panic error event
      onEvent?.({
        type: "route.error",
        data: {
          route: route,
          error: panicError,
          isPanic: true,
          context: `${streamType === "rsc" && rscVariant ? rscVariant : streamType}.stream.error`,
        },
      });
    }
    
    onError?.(id, error);
    cleanup();
  });
  
  // Set up end handling
  stream.on('end', () => {
    if (verbose) {
      const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
      logger?.info(`[unified-stream:${id}] ${streamLabel} stream ended for route: ${route}`);
    }
    onEnd?.(id);
    cleanup();
  });
  
  return {
    stream,
    abort,
    cleanup,
    streamType,
    rscVariant,
  };
}

/**
 * Creates a unified message handler that consolidates common message handling patterns
 * across html-worker and rsc-worker.
 * 
 * This handler provides:
 * - Consistent message type routing based on stream type
 * - Unified error handling with panic threshold support
 * - Standardized cleanup patterns
 * - Common logging patterns
 * - Event emission for error handling
 * - Pass-through for metrics collection
 * - Stream type awareness (RSC vs HTML)
 */
export function createUnifiedMessageHandler(options: UnifiedMessageHandlerOptions): UnifiedMessageHandler {
  const { route, id, streamType, rscVariant, verbose, logger, panicThreshold = "none", onError, onEnd, onCleanup, onEvent } = options;
  
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
      const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
      logger?.info(`[unified-message:${id}] Cleaned up${operationId ? ` operation: ${operationId}` : ' all operations'} for ${streamLabel} stream route: ${route}`);
    }
  };
  
  // Unified error handler with panic threshold support
  const handleLocalError = (error: Error, context?: string) => {
    const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
    const errorContext = context ? `${context} for ${streamLabel} stream route: ${route}` : `for ${streamLabel} stream route: ${route}`;
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
      context: `${streamLabel} message handler error ${errorContext}`,
    });
    
    if (panicError != null) {
      // Emit panic error event
      onEvent?.({
        type: "route.error",
        data: {
          route: route,
          error: panicError,
          isPanic: true,
          context: `${streamType === "rsc" && rscVariant ? rscVariant : streamType}.message.handler.error`,
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
        const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
        logger?.info(`[unified-message:${id}] Received ${streamLabel} message: ${msg.type} for id: ${msg.id || 'unknown'}`);
      }
      
      // Route message based on stream type and message type
      const expectedRenderType = "INIT";
      const expectedChunkType = streamType === "rsc" ? "RSC_CHUNK" : "HTML_CHUNK";
      
      switch (msg.type) {
        case expectedRenderType:
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
          
        case expectedChunkType:
          // Handle chunk processing
          if (verbose) {
            const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
            logger?.info(`[unified-message:${id}] Processing ${streamLabel} chunk: ${msg.chunk?.length || 0} bytes`);
          }
          break;
          
        case 'RSC_END':
        case 'HTML_END':
          // Handle stream end
          if (verbose) {
            const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
            logger?.info(`[unified-message:${id}] ${streamLabel} stream ended for id: ${msg.id}`);
          }
          onEnd?.(msg.id);
          cleanup(msg.id);
          break;
          
        case 'RSC_ERROR':
        case 'HTML_ERROR':
          // Handle stream error
          if (verbose) {
            const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
            logger?.error(`[unified-message:${id}] ${streamLabel} stream error for id: ${msg.id}: ${msg.error}`);
          }
          handleLocalError(new Error(msg.error), `Stream error for id: ${msg.id}`);
          break;
          
        default:
          if (verbose) {
            const streamLabel = streamType === "rsc" && rscVariant ? rscVariant.toUpperCase() : streamType.toUpperCase();
            logger?.warn(`[unified-message:${id}] Unknown ${streamLabel} message type: ${msg.type}`);
          }
          break;
      }
    } catch (error) {
      handleLocalError(error instanceof Error ? error : new Error(String(error)), 'Message handling');
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


