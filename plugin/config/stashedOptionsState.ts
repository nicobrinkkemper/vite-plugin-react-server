import type { ResolvedUserOptions, CreateHandlerOptions } from "../types.js";

// Stashed user options for different environments
const stashedUserOptions: Record<string, ResolvedUserOptions | null> = {};

// Stashed handler options for different ids
const stashedHandlerOptions: Record<string, CreateHandlerOptions | null> = {};

// Stashed RSC streams for client environments
const stashedRscStreams: Record<string, any> = {};

/**
 * Store user options for a specific environment
 */
export function stashUserOptions(
  envId: string,
  userOptions: ResolvedUserOptions
): void {
  stashedUserOptions[envId] = userOptions;
}

/**
 * Get stashed user options for a specific environment
 */
export function getStashedUserOptions(
  envId: string
): ResolvedUserOptions | null {
  return stashedUserOptions[envId] || null;
}

/**
 * Clear stashed user options for a specific environment
 */
export function clearStashedUserOptions(envId: string): void {
  delete stashedUserOptions[envId];
}

/**
 * Store handler options for a specific id
 */
export function stashHandlerOptions(
  id: string,
  handlerOptions: CreateHandlerOptions
): void {
  stashedHandlerOptions[id] = handlerOptions;
}

/**
 * Get stashed handler options for a specific id
 */
export function getStashedHandlerOptions(
  id: string
): CreateHandlerOptions | null {
  return stashedHandlerOptions[id] || null;
}

/**
 * Store RSC stream for a specific id (for client environments)
 */
export function stashRscStream(
  id: string,
  rscStream: any
): void {
  stashedRscStreams[id] = rscStream;
}

/**
 * Get stashed RSC stream for a specific id
 */
export function getStashedRscStream(
  id: string
): any | null {
  return stashedRscStreams[id] || null;
}

/**
 * Clear stashed handler options for a specific id
 */
export function clearStashedHandlerOptions(id: string): void {
  delete stashedHandlerOptions[id];
}

/**
 * Clear stashed RSC stream for a specific id
 */
export function clearStashedRscStream(id: string): void {
  delete stashedRscStreams[id];
}

/**
 * Clear all stashed handler options
 */
export function clearAllStashedHandlerOptions(): void {
  Object.keys(stashedHandlerOptions).forEach((id) => {
    delete stashedHandlerOptions[id];
  });
}

/**
 * Clear all stashed RSC streams
 */
export function clearAllStashedRscStreams(): void {
  Object.keys(stashedRscStreams).forEach((id) => {
    delete stashedRscStreams[id];
  });
}

/**
 * Get all stashed ids
 */
export function getStashedRoutes(): string[] {
  return Object.keys(stashedHandlerOptions);
}

/**
 * Get all stashed RSC stream ids
 */
export function getStashedRscStreamRoutes(): string[] {
  return Object.keys(stashedRscStreams);
}

/**
 * Check if handler options are stashed for a id
 */
export function hasStashedHandlerOptions(id: string): boolean {
  return id in stashedHandlerOptions;
}

/**
 * Check if RSC stream is stashed for a id
 */
export function hasStashedRscStream(id: string): boolean {
  return id in stashedRscStreams;
}

/**
 * Get environment ID from condition and mode
 */
export function getEnvironmentId(
  condition: string,
  mode: string
): string {
  return `${condition}.${mode}`;
} 