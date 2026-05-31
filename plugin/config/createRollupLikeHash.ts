import { createHash } from "node:crypto";

/**
 * Content-addressed hash for client-component module IDs that mimics Rollup's
 * `hashCharacters` semantics. Used to give every hosted client module a stable,
 * source-content-derived suffix so the build's emitted chunk and the registered
 * client reference agree on the same filename across runs and across the
 * transformer / build / SSG pipelines.
 *
 * Hashes the input with sha1, then truncates the first 8 hex characters and
 * re-encodes them into one of three character sets:
 *   - `base36` (default): hex parsed as int then `.toString(36)` — Rollup's
 *     default; short, filename-safe, no special characters.
 *   - `base64`: first 8 hex chars decoded to bytes and base64-encoded with
 *     URL-safe substitutions (`+`→`-`, `/`→`_`, `=` stripped).
 *   - `hex`: raw first 8 hex characters.
 *
 * `base36` is the default because it matches Rollup's own default and produces
 * the shortest hash for the same input space, which keeps generated module IDs
 * compact in source maps and import graphs.
 */
export const createRollupLikeHash = (
  content: string,
  hashCharacters: "base36" | "base64" | "hex" = "base36",
) => {
  const hash = createHash("sha1");
  hash.update(content);
  const fullHash = hash.digest("hex");

  // Apply the same character set logic as Rollup
  switch (hashCharacters) {
    case "base36":
      // Convert hex to base36 (0-9, a-z)
      return parseInt(fullHash.substring(0, 8), 16).toString(36);
    case "base64":
      // Convert to base64-like format (A-Z, a-z, 0-9, -, _)
      return Buffer.from(fullHash.substring(0, 8), "hex")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    case "hex":
    default:
      // Return hex format
      return fullHash.substring(0, 8);
  }
};
