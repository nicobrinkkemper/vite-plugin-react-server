/**
 * Centralized panic threshold handling logic
 * 
 * This module provides a single place to handle panic threshold decisions
 * instead of scattering the logic across multiple files.
 */

import { shouldPanic, isPanic } from "./shouldPanic.js";
import type { PanicThreshold } from "../types.js";

export interface PanicThresholdOptions {
  panicThreshold: PanicThreshold;
  critical?: boolean;
  logger?: any;
  context?: string;
}

/**
 * Determines if an error should cause a panic based on panic threshold settings
 */
export function shouldCausePanic(
  error: unknown,
  options: PanicThresholdOptions
): boolean {
  return shouldPanic(error, options.panicThreshold, options.critical);
}

/**
 * Handles an error based on panic threshold settings
 * Returns the error if it should cause a panic, null otherwise
 */
export function handlePanicThreshold(
  error: unknown,
  options: PanicThresholdOptions
): Error | null {
  if (shouldCausePanic(error, options)) {
    // Mark error for panic and return it to be thrown
    const err = error instanceof Error ? error : new Error(String(error));
    (err as any)[Symbol.for('vite-plugin-react-server.panic')] = true;
    return err;
  }
  return null;
}

/**
 * Checks if an error is already marked as a panic error
 */
export function isPanicError(error: unknown): boolean {
  return isPanic(error);
}


