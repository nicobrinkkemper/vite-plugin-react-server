import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import type { InputNormalizerWorker } from "../types.js";

interface ServerNormalizerOptions {
  root: string;
  htmlWorker: Worker;
}

export function createServerInputNormalizer({
  root,
  htmlWorker
}: ServerNormalizerOptions): InputNormalizerWorker {
  return async (input) => {
    // Handle React components with worker
    if (typeof input === "function") {
      return new Promise((resolve, reject) => {
        const handler = (message: any) => {
          if (message.type === "CLIENT_REFERENCE") {
            htmlWorker.off('message', handler);
            resolve([message.ref.$$id, message.ref.$$location]);
          }
          if (message.type === "ERROR") {
            htmlWorker.off('message', handler);
            reject(new Error(message.error));
          }
        };

        htmlWorker.on('message', handler);
        htmlWorker.postMessage({
          type: "CLIENT_REFERENCE",
          id: input.name || 'AnonymousComponent',
          location: input.toString(),
          key: input.name
        });
      });
    }

    // Handle tuple input [key, path]
    if (Array.isArray(input)) {
      const [key, path] = input;
      return [key, join(root, path)];
    }

    // Handle string input
    if (typeof input === "string") {
      return [input, join(root, input)];
    }

    throw new Error(`Invalid input type: ${typeof input}`);
  };
} 