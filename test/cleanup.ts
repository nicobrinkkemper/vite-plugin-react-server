import { shutdownAllWorkers } from "../plugin/worker/createWorker.js";

/**
 * Cleanup utility for tests to ensure proper worker shutdown
 */
export async function cleanupWorkers(): Promise<void> {
  try {
    await shutdownAllWorkers(5000); // 5 second timeout to let React finish consuming
  } catch (error) {
    console.warn('Worker cleanup warning:', error);
  }
}

/**
 * Setup cleanup for test files - call this in afterAll
 */
export function setupTestCleanup() {
  // Register cleanup for various exit scenarios
  const cleanup = () => {
    shutdownAllWorkers(1000).catch(() => {
      // Ignore cleanup errors during process exit
    });
  };
  
  // Only register if not already registered
  if (!process.listenerCount('exit')) {
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

/**
 * Aggressive cleanup for problematic tests that might leave workers in bad state
 * Use this in afterEach for tests that intentionally cause errors
 */
export async function forceCleanupWorkers(): Promise<void> {
  try {
    // More aggressive timeout for force cleanup
    await shutdownAllWorkers(500); // Shorter timeout for faster cleanup
  } catch (error) {
    console.warn('Force worker cleanup warning:', error);
  }
}
