import { createHtmlStream as devCreateHtmlStream } from './createHtmlStream.js';
import { createWorker as devCreateWorker } from '../createWorker.js';

// Development-specific implementations
export const createHtmlStream = devCreateHtmlStream;
export const createWorker = devCreateWorker; 