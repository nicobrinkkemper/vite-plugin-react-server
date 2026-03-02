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
