import type { Worker } from 'worker_threads';
import type { InputNormalizerWorker } from '../types.js';

type ClientNormalizerOptions = {
  rscWorker: Worker;
};

export const createClientInputNormalizer = ({
  rscWorker
}: ClientNormalizerOptions): InputNormalizerWorker => {
  return async (input): Promise<[string, string]> => {
    // Handle string
    if(typeof input === "string") {
      return [input, input];
    }

    // Handle React component
    if(typeof input === "function") {
      return new Promise((resolve, reject) => {
        const handler = (message: any) => {
          if (message.type === "CLIENT_REFERENCE") {
            rscWorker.off('message', handler);
            resolve([message.ref.$$id, message.ref.$$location]);
          }
          if (message.type === "ERROR") {
            rscWorker.off('message', handler);
            reject(new Error(message.error));
          }
        };

        rscWorker.on('message', handler);
        rscWorker.postMessage({
          type: "CLIENT_REFERENCE",
          id: input.name || 'AnonymousComponent',
          location: input.toString(),
          key: input.name
        });
      });
    }

    // Handle arrays
    if(Array.isArray(input)) {
      return [input[0], input[0]];
    }

    throw new Error('Invalid client input type');
  };
}; 