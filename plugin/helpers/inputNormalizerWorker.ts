import type { Worker } from "node:worker_threads";
import type { InputNormalizerWorker, NormalizerInput } from "../types.js";
import { createInputNormalizer } from "./inputNormalizer.js";

interface WorkerNormalizerOptions {
  root: string;
  moduleBase: string;
  worker: Worker;
  moduleBaseExceptions?: string[];
}

export function createInputNormalizerWorker({
  root,
  worker,
}: WorkerNormalizerOptions): InputNormalizerWorker {
  
  const baseNormalizer = createInputNormalizer(root);

  return async (input: NormalizerInput): Promise<[string, string]> => {
    // Handle React components specially with worker
    if (typeof input === "function") {
      return new Promise((resolve, reject) => {
        const handler = (message: any) => {
          if (message.type === "CLIENT_REFERENCE") {
            worker.off('message', handler);
            resolve([message.ref.$$id, message.ref.$$location]);
          }
          if (message.type === "ERROR") {
            worker.off('message', handler);
            reject(new Error(message.error));
          }
        };

        worker.on('message', handler);
        worker.postMessage({
          type: "CLIENT_REFERENCE",
          id: input.name || 'AnonymousComponent',
          location: input.toString(),
          key: input.name
        });
      });
    }

    // For all other types, use the base normalizer
    return baseNormalizer(input);
  };
} 