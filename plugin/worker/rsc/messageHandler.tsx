import { parentPort, workerData, type MessagePort } from "node:worker_threads";
import { addCssFileContent, hmrState } from "./state.js";
import { handleRender } from './handleRender.js';

export function messageHandler(msg: any, port = parentPort, reactLoaderPort: MessagePort, cssLoaderPort: MessagePort) {
  if(!port) {
    throw new Error('No port found');
  }
  switch (msg.type) {
    case "RSC_RENDER":
      return handleRender(msg, port, reactLoaderPort, cssLoaderPort);
    case "INITIALIZED_REACT_LOADER":
      return;
    case "INITIALIZED_CSS_LOADER":
      return;
    case "HMR_UPDATE":
      // Mark the module as invalidated
      console.log('[RSC Worker] Processing HMR_UPDATE for path:', msg.path);
      hmrState.set(msg.path, {
        timestamp: Date.now(),
        invalidated: true
      });
      return;
    case "HMR_ACCEPT":
      // Clear the invalidation state
      console.log('[RSC Worker] Processing HMR_ACCEPT for path:', msg.path);
      hmrState.delete(msg.path);
      return;
    case "CSS_FILE":
      if (msg.id) {
        addCssFileContent(msg.id, msg.content, {
          projectRoot: workerData.projectRoot || process.cwd(),
          moduleBaseURL: workerData.moduleBaseURL || '',
          moduleBasePath: workerData.moduleBasePath || '',
          moduleRootPath: workerData.moduleRootPath || '',
          css: workerData.css || {
            inlineThreshold: 1000,
          },
        });

      }
      return;
    default: {
      return;
    }
  }
}