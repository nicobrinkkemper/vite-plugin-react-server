import { createWorker as prodCreateWorker } from '../createWorker.js';

// Production-specific optimizations could go here
export const createWorker = prodCreateWorker; 