// Shared, dependency-free constants for the inline flight payload <script>.
// Live here (no node imports) so both the browser-side createReactFetcher and
// the build-side inlineFlightPayload helper can reference the same contract.
export const INLINE_FLIGHT_ID = "vprs-flight";

/**
 * Attribute carrying the payload's expected character count.
 *
 * The payload is the TEXT of an inline `<script>`, so a reader cannot otherwise
 * tell a complete element from one the HTML parser is still writing into — or
 * from one whose parse was abandoned partway (the user pressing Stop, a stalled
 * connection). Stamping the length at build time makes an incomplete read
 * *detectable* rather than something we infer from timing: the reader compares
 * it against `textContent.length` and treats any mismatch as "no usable inline
 * payload", falling back to the network.
 *
 * The attribute sits on the opening tag, so it is available to the reader as
 * soon as the element exists — long before its text is complete.
 */
export const INLINE_FLIGHT_LENGTH_ATTR = "data-length";
