import type { Worker } from "node:worker_threads";

// Simple module-level worker reference for dev server context
let worker: Worker | null = null;

export const setWorker = (w: Worker | null) => {
  worker = w;
};

export const getWorker = (): Worker | null => {
  return worker;
};

export const clearWorker = () => {
  worker = null;
}; 