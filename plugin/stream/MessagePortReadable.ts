import { Readable } from "node:stream";
import type { MessagePort } from "node:worker_threads";

/**
 * A Readable stream that wraps a MessagePort for receiving data from a worker thread
 * 
 * This provides a proper Node.js stream interface for data coming from a worker thread,
 * with proper backpressure handling through drain events.
 */
export class MessagePortReadable extends Readable {
  private fromWorker: MessagePort;
  private toWorker?: MessagePort;
  private ended = false;
  public closed = false;

  constructor(fromWorker: MessagePort, toWorker?: MessagePort) {
    super({
      objectMode: false, // We're dealing with raw data chunks
      highWaterMark: 16 * 1024, // 16KB buffer
    });
    
    this.fromWorker = fromWorker;
    this.toWorker = toWorker;
    this.setupMessageListener();
  }

  private setupMessageListener() {
    this.fromWorker.on('message', (chunk: any) => {
      if (this.closed || this.ended) {
        return; // Ignore messages after close/end
      }

      if (chunk === null) {
        // End of stream signal
        this.ended = true;
        this.push(null);
        return;
      }

      // Convert chunk to Buffer if needed for proper stream handling
      let bufferChunk: Buffer;
      if (Buffer.isBuffer(chunk)) {
        bufferChunk = chunk;
      } else if (chunk instanceof Uint8Array) {
        bufferChunk = Buffer.from(chunk);
      } else if (typeof chunk === 'string') {
        bufferChunk = Buffer.from(chunk, 'utf8');
      } else {
        // If it's an object, it might be a serialized buffer - convert to string
        bufferChunk = Buffer.from(JSON.stringify(chunk), 'utf8');
      }
      
      // Push data to the stream
      const canContinue = this.push(bufferChunk);
      
      // If the stream is backpressured, send a drain signal to the worker
      if (!canContinue && !this.closed) {
        try {
          if (this.toWorker) {
            this.toWorker.postMessage({ type: 'DRAIN' });
          } else {
            // Fallback to data port if no control port
            this.fromWorker.postMessage({ type: 'DRAIN' });
          }
        } catch (error) {
          // Port may be closed - ignore drain signal
        }
      }
    });

    this.fromWorker.on('close', () => {
      this.closed = true;
      if (!this.ended) {
        this.ended = true;
        this.push(null);
      }
    });

    this.fromWorker.on('error', (error: any) => {
      this.closed = true;
      if (!this.ended) {
        this.ended = true;
        this.destroy(error);
      }
    });
  }

  _read() {
    // The stream is ready to receive more data
    // Send a drain signal to the worker to resume writing
    if (!this.closed && !this.ended) {
      try {
        this.fromWorker.postMessage({ type: 'DRAIN' });
      } catch (error) {
        // Port may be closed - ignore drain signal
      }
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    // Mark as closed but don't close the port here
    // Let the consuming side (React) manage the port lifecycle
    // This prevents "Connection closed" errors when React is still consuming
    this.closed = true;
    
    // Note: We don't call this.port.close() here. The port will be closed
    // by the higher-level stream management when React is completely done.
    // This follows the idiomatic Node.js streams pattern where the consumer
    // controls the lifecycle, not the producer.
    
    callback(error);
  }
}
