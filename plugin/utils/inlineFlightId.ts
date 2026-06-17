// Shared, dependency-free constant for the inline flight payload <script>.
// Lives here (no node imports) so both the browser-side createReactFetcher and
// the build-side inlineFlightPayload helper can reference the same id.
export const INLINE_FLIGHT_ID = "vprs-flight";
