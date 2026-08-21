import { Writable } from "node:stream";
import type { MessagePort } from "node:worker_threads";

/**
 * A Writable stream that wraps a MessagePort for sending data to the main thread
 * 
 * This provides a proper Node.js stream interface for data going to the main thread,
 * with proper backpressure handling through drain events.
 */
export class MessagePortWritable extends Writable {
  private fromWorker: MessagePort;
  private toWorker?: MessagePort;
  private isBackpressured: boolean = false;
  private closeHandler: (() => void) | null = null;
  private messageHandler: ((message: any) => void) | null = null;
  /**
   * The one in-flight write parked while the consumer holds us paused. The
   * Writable contract guarantees a single pending _write at a time, so one
   * slot suffices. A paused write MUST be parked — chunk AND callback — and
   * flushed on RESUME: dropping the chunk corrupts the stream, and never
   * calling the callback wedges the Writable (React's flight pipe then waits
   * forever on a drain that cannot come). Both happened here once.
   */
  private pendingWrite: {
    chunk: unknown;
    callback: (error?: Error | null) => void;
  } | null = null;

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
    this.closeHandler = () => {
      this.destroy();
    };
    this.fromWorker.on('close', this.closeHandler);

    // Listen for backpressure signals on the control port. Wire naming is
    // historical: DRAIN = "pause, my buffer is full", RESUME = "go again".
    if (this.toWorker) {
      this.messageHandler = (message: any) => {
        if (message.type === 'DRAIN') {
          this.isBackpressured = true;
        } else if (message.type === 'RESUME') {
          this.isBackpressured = false;
          this.flushPendingWrite();
        }
      };
      this.toWorker.on('message', this.messageHandler);
    }
  }

  /** Release the parked write after the consumer un-pauses us. */
  private flushPendingWrite() {
    const pending = this.pendingWrite;
    if (!pending) return;
    this.pendingWrite = null;
    try {
      this.fromWorker.postMessage(pending.chunk);
      pending.callback();
    } catch (error) {
      pending.callback(error as Error);
    }
  }

  private removeListeners() {
    if (this.closeHandler) {
      this.fromWorker.removeListener('close', this.closeHandler);
      this.closeHandler = null;
    }
    if (this.messageHandler && this.toWorker) {
      this.toWorker.removeListener('message', this.messageHandler);
      this.messageHandler = null;
    }
  }

  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      // Paused by the consumer: PARK the write until RESUME. Returning
      // without completing the callback is correct Writable backpressure —
      // but only if the chunk and callback are kept and flushed later.
      if (this.isBackpressured) {
        this.pendingWrite = { chunk, callback };
        return;
      }

      // Check if the chunk contains an error - if so, don't send it through the data stream
      // Errors should be handled through the control port, not the data stream
      if (chunk && typeof chunk === 'object' && chunk.type === 'error') {
        callback(new Error('Error sent through data stream - this should be handled by control port'));
        return;
      }
      
      // Send the chunk through the MessagePort
      this.fromWorker.postMessage(chunk);
      
      // Signal that the write completed successfully
      callback();
      
    } catch (error) {
      callback(error as Error);
    }
  }

  _final(callback: (error?: Error | null) => void) {
    try {
      this.fromWorker.postMessage(null); // End-of-stream signal
      callback();
      
      process.nextTick(() => {
        this.removeListeners();
        this.emit('finish');
      });
    } catch (error) {
      callback(error as Error);
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    // A write parked at destroy time must not dangle — fail it so the
    // producer's pipeline settles instead of waiting forever.
    const pending = this.pendingWrite;
    this.pendingWrite = null;
    pending?.callback(error ?? new Error("MessagePortWritable destroyed"));
    this.removeListeners();
    callback(error);
  }

}
