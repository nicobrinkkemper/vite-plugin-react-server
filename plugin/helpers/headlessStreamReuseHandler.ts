// No imports needed for this function

/**
 * Creates a Page component that reuses elements from a headless stream
 */
export function createHeadlessReusePageComponent({
  reuseHeadlessStreamId,
  headlessStreamElements,
  headlessStreamErrors,
  route,
  verbose,
  logger,
}: {
  reuseHeadlessStreamId: string;
  headlessStreamElements: Map<string, any>;
  headlessStreamErrors: Map<string, any>;
  route: string;
  verbose: boolean;
  logger: any;
}): (() => any) | undefined {
  if (verbose) {
    logger?.info(`[headlessStreamReuseHandler] Looking for reusable elements for stream ${reuseHeadlessStreamId}`);
  }

  // Check if the headless stream had errors
  if (headlessStreamErrors.has(route)) {
    if (verbose) {
      logger?.info(`[headlessStreamReuseHandler] Headless stream had errors for route ${route}, not reusing`);
    }
    return undefined;
  }

  // Look for the reusable elements
  const reusableElements = headlessStreamElements.get(reuseHeadlessStreamId);
  if (!reusableElements) {
    if (verbose) {
      logger?.info(`[headlessStreamReuseHandler] No reusable elements found for stream ${reuseHeadlessStreamId}`);
    }
    return undefined;
  }

  if (verbose) {
    logger?.info(`[headlessStreamReuseHandler] Found reusable elements for stream ${reuseHeadlessStreamId}`);
  }

  // Return a function that returns the stored elements
  return () => reusableElements.elements;
}