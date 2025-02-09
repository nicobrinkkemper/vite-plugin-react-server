import { createRscStream as devCreateRscStream } from './createRscStream.js';
import { createWorker as devCreateWorker } from '../createWorker.js';

// Development-specific implementations
export const createRscStream = devCreateRscStream;
export const createWorker = devCreateWorker; 