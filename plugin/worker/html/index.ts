export { reactHtmlWorkerPlugin } from "./plugin.js";

// Dynamic import based on NODE_ENV
export const worker = await (
  process.env['NODE_ENV'] === 'production' 
    ? import('./production.js') 
    : import('./development.js')
);

// Re-export worker functions
export const {
  createHtmlStream,
  createWorker
} = worker;
