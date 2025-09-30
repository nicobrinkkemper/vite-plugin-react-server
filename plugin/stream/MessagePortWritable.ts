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
    this.fromWorker.on('close', () => {
      this.destroy();
    });

    // Listen for backpressure signals on the control port
    if (this.toWorker) {
      this.toWorker.on('message', (message: any) => {
        if (message.type === 'DRAIN') {
          this.isBackpressured = true;
        } else if (message.type === 'RESUME') {
          this.isBackpressured = false;
        }
      });
    }
  }


  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      // Check if we're backpressured - if so, don't send data
      if (this.isBackpressured) {
        // Signal backpressure to React by not calling callback immediately
        // React will wait and retry when the stream is ready
        return;
      }
      
      // Send the chunk through the MessagePort
      this.fromWorker.postMessage(chunk);
      
      // Signal that the write completed successfully
      // This is the idiomatic Node.js stream pattern - React expects this callback
      callback();
      
    } catch (error) {
      callback(error as Error);
    }
  }

  _final(callback: (error?: Error | null) => void) {
    // React Server DOM calls this when the stream is complete
    // Send the completion signal through MessagePort and emit 'finish' event
    try {
      this.fromWorker.postMessage(null); // End-of-stream signal
      callback();
      
      // Emit finish event to trigger passThrough.on("end") handler in worker
      // This is what allows the worker to call handlers.onEnd(id)
      process.nextTick(() => {
        this.emit('finish');
      });
    } catch (error) {
      callback(error as Error);
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    // Don't close the port here - let the consuming side manage port lifecycle
    // This follows the idiomatic Node.js streams pattern per the Worker Threads docs
    callback(error);
  }

}
