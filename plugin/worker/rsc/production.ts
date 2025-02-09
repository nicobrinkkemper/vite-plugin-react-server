import { createRscStream as prodCreateRscStream } from './createRscStream.js';
import { createWorker as prodCreateWorker } from '../createWorker.js';

// Production-specific optimizations could go here
export const createRscStream = prodCreateRscStream;
export const createWorker = prodCreateWorker; 