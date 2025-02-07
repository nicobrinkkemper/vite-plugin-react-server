import { DEFAULT_CONFIG } from './defaults.js';

export const getWorkerPath = (condition: 'react-client' | 'react-server'): string => {
  return condition === 'react-server' ? DEFAULT_CONFIG.HTML_WORKER_PATH : DEFAULT_CONFIG.RSC_WORKER_PATH;
} 