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
  private messageHandler?: (chunk: any) => void;
  private closeHandler?: () => void;
  private errorHandler?: (error: any) => void;

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
    this.messageHandler = (chunk: any) => {
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
      
      // Buffer full: pause the worker's writable (wire naming is historical —
      // DRAIN means "pause"). Control traffic rides the CONTROL port only;
      // posting objects onto the data port would interleave them with the
      // flight bytes.
      if (!canContinue && !this.closed && this.toWorker) {
        try {
          this.toWorker.postMessage({ type: 'DRAIN' });
        } catch (error) {
          // Port may be closed - ignore drain signal
        }
      }
    };

    this.closeHandler = () => {
      this.closed = true;
      if (!this.ended) {
        // The port closed before the data null arrived: a truncation (dead
        // worker, torn-down channel), never a legitimate end. Ending cleanly
        // here lets a consumer (e.g. the SSG writer) treat a partial payload
        // as build success — error loudly instead.
        this.ended = true;
        this.destroy(
          new Error(
            "MessagePortReadable: port closed before end-of-stream (null) — stream truncated"
          )
        );
      }
    };

    this.errorHandler = (error: any) => {
      this.closed = true;
      if (!this.ended) {
        this.ended = true;
        this.destroy(error);
      }
    };

    this.fromWorker.on('message', this.messageHandler);
    this.fromWorker.on('close', this.closeHandler);
    this.fromWorker.on('error', this.errorHandler);
  }

  _read() {
    // The stream is ready for more data: un-pause the worker's writable.
    // This must be RESUME on the CONTROL port — the writable only listens
    // there, and DRAIN is the pause signal. The old code sent DRAIN on the
    // DATA port: never received, so a paused producer stayed paused forever
    // (the isolated-runner suspended-flight stall under dev-variant builds).
    if (!this.closed && !this.ended && this.toWorker) {
      try {
        this.toWorker.postMessage({ type: 'RESUME' });
      } catch (error) {
        // Port may be closed - ignore resume signal
      }
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    // Mark as closed but don't close the port here
    // Let the consuming side (React) manage the port lifecycle
    // This prevents "Connection closed" errors when React is still consuming
    this.closed = true;
    
    // Clean up event listeners to prevent memory leaks
    if (this.messageHandler) {
      this.fromWorker.removeListener('message', this.messageHandler);
    }
    if (this.closeHandler) {
      this.fromWorker.removeListener('close', this.closeHandler);
    }
    if (this.errorHandler) {
      this.fromWorker.removeListener('error', this.errorHandler);
    }
    
    // Note: We don't call this.port.close() here. The port will be closed
    // by the higher-level stream management when React is completely done.
    // This follows the idiomatic Node.js streams pattern where the consumer
    // controls the lifecycle, not the producer.
    
    callback(error);
  }
}
