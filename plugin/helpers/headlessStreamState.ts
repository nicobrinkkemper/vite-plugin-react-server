/**
 * Manages headless stream state for error tracking and element reuse.
 * Used by both client and server workflows for consistent behavior.
 */

export interface HeadlessStreamData {
  PageComponent: any;
  errored: boolean;
}

export interface HeadlessStreamState {
  elements: Map<string, HeadlessStreamData>;
  errors: Map<string, Error>;
}

/**
 * Creates a new headless stream state manager.
 */
export function createHeadlessStreamState(): HeadlessStreamState {
  return {
    elements: new Map<string, HeadlessStreamData>(),
    errors: new Map<string, Error>(),
  };
}

/**
 * Tracks a headless stream error for a route.
 * 
 * @param state - The headless stream state
 * @param route - The route that had an error
 * @param error - The error that occurred
 */
export function trackHeadlessStreamError(
  state: HeadlessStreamState,
  route: string,
  error: Error
): void {
  state.errors.set(route, error);
}

/**
 * Checks if a route has a headless stream error.
 * 
 * @param state - The headless stream state
 * @param route - The route to check
 * @returns true if the route has a headless stream error
 */
export function hasHeadlessStreamError(
  state: HeadlessStreamState,
  route: string
): boolean {
  return state.errors.has(route);
}

/**
 * Gets the headless stream error for a route.
 * 
 * @param state - The headless stream state
 * @param route - The route to get the error for
 * @returns The error if it exists, undefined otherwise
 */
export function getHeadlessStreamError(
  state: HeadlessStreamState,
  route: string
): Error | undefined {
  return state.errors.get(route);
}

/**
 * Stores headless stream elements for reuse.
 * 
 * @param state - The headless stream state
 * @param streamId - The stream ID
 * @param data - The stream data to store
 */
export function storeHeadlessStreamElements(
  state: HeadlessStreamState,
  streamId: string,
  data: HeadlessStreamData
): void {
  state.elements.set(streamId, data);
}

/**
 * Gets headless stream elements for reuse.
 * 
 * @param state - The headless stream state
 * @param streamId - The stream ID
 * @returns The stream data if it exists, undefined otherwise
 */
export function getHeadlessStreamElements(
  state: HeadlessStreamState,
  streamId: string
): HeadlessStreamData | undefined {
  return state.elements.get(streamId);
}

/**
 * Cleans up headless stream elements after use.
 * 
 * @param state - The headless stream state
 * @param streamId - The stream ID to clean up
 */
export function cleanupHeadlessStreamElements(
  state: HeadlessStreamState,
  streamId: string
): void {
  state.elements.delete(streamId);
}

/**
 * Clears all headless stream errors for a route.
 * 
 * @param state - The headless stream state
 * @param route - The route to clear errors for
 */
export function clearHeadlessStreamErrors(
  state: HeadlessStreamState,
  route: string
): void {
  state.errors.delete(route);
}
