import { createHtmlStream as prodCreateHtmlStream } from './createHtmlStream.js';
import { createWorker as prodCreateWorker } from '../createWorker.js';

// Production-specific optimizations could go here
export const createHtmlStream = prodCreateHtmlStream;
export const createWorker = prodCreateWorker; 