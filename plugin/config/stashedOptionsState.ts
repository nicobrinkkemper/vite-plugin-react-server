import type { ResolvedUserOptions, CreateHandlerOptions } from "../types.js";

// Stashed user options for different environments
const stashedUserOptions: Record<string, ResolvedUserOptions | null> = {};

// Stashed handler options for different routes
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
 * Store handler options for a specific route
 */
export function stashHandlerOptions(
  route: string,
  handlerOptions: CreateHandlerOptions
): void {
  stashedHandlerOptions[route] = handlerOptions;
}

/**
 * Get stashed handler options for a specific route
 */
export function getStashedHandlerOptions(
  route: string
): CreateHandlerOptions | null {
  return stashedHandlerOptions[route] || null;
}

/**
 * Store RSC stream for a specific route (for client environments)
 */
export function stashRscStream(
  route: string,
  rscStream: any
): void {
  stashedRscStreams[route] = rscStream;
}

/**
 * Get stashed RSC stream for a specific route
 */
export function getStashedRscStream(
  route: string
): any | null {
  return stashedRscStreams[route] || null;
}

/**
 * Clear stashed handler options for a specific route
 */
export function clearStashedHandlerOptions(route: string): void {
  delete stashedHandlerOptions[route];
}

/**
 * Clear stashed RSC stream for a specific route
 */
export function clearStashedRscStream(route: string): void {
  delete stashedRscStreams[route];
}

/**
 * Clear all stashed handler options
 */
export function clearAllStashedHandlerOptions(): void {
  Object.keys(stashedHandlerOptions).forEach((route) => {
    delete stashedHandlerOptions[route];
  });
}

/**
 * Clear all stashed RSC streams
 */
export function clearAllStashedRscStreams(): void {
  Object.keys(stashedRscStreams).forEach((route) => {
    delete stashedRscStreams[route];
  });
}

/**
 * Get all stashed routes
 */
export function getStashedRoutes(): string[] {
  return Object.keys(stashedHandlerOptions);
}

/**
 * Get all stashed RSC stream routes
 */
export function getStashedRscStreamRoutes(): string[] {
  return Object.keys(stashedRscStreams);
}

/**
 * Check if handler options are stashed for a route
 */
export function hasStashedHandlerOptions(route: string): boolean {
  return route in stashedHandlerOptions;
}

/**
 * Check if RSC stream is stashed for a route
 */
export function hasStashedRscStream(route: string): boolean {
  return route in stashedRscStreams;
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