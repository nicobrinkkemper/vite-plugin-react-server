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

    // Listen for backpressure signals on the control port
    if (this.toWorker) {
      this.messageHandler = (message: any) => {
        if (message.type === 'DRAIN') {
          this.isBackpressured = true;
        } else if (message.type === 'RESUME') {
          this.isBackpressured = false;
        }
      };
      this.toWorker.on('message', this.messageHandler);
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
      // Check if we're backpressured - if so, don't send data
      if (this.isBackpressured) {
        // Signal backpressure to React by not calling callback immediately
        // React will wait and retry when the stream is ready
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
    this.removeListeners();
    callback(error);
  }

}
