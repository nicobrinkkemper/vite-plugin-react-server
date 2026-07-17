/**
 * Marker the baked flight producer throws for a url it has no route for (see the
 * generated entry in plugin/bundle/buildEdgeBundle.ts). The bundle is a CLOSED
 * manifest over `build.pages` + `routePatterns`, so an unmatched url is a 404,
 * not a 500 — but a render that genuinely failed must still surface. This one
 * marker is the seam between those two, so the bake and every handler that maps
 * it have to agree on the exact string.
 */
export const UNKNOWN_ROUTE_MARKER = "[edge] unknown route:";

/** Whether an error is the baked producer's "no such route" throw. */
export function isUnknownRoute(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(UNKNOWN_ROUTE_MARKER)
  );
}
