/**
 * workerMessageHandler.ts
 * 
 * PURPOSE: Handles output messages from HTML worker thread
 * 
 * This module:
 * 1. Processes messages from the HTML worker
 * 2. Manages route promises and page data
 */

import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";

export interface WorkerMessage {
  type: string;
  id: string;
  chunk?: string;
  html?: string;
  error?: string;
  success?: boolean;
  message?: string;
  metrics?: {
    chunksReceived: number;
    chunksProcessed: number;
    totalBytes: number;
  };
}

export function createWorkerMessageStream(worker: Worker): Transform {
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      const msg = JSON.parse(chunk.toString()) as WorkerMessage;
      // Only log errors
      if (msg.type === "ERROR") {
        console.error(`[html-worker-output] Error for ${msg.id}: ${msg.error}`);
      }
      callback(null);
    }
  });
  
  return stream;
} 