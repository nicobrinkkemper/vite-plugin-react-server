/**
 * Derive whether the current `config()` pass is an SSR build from Vite's
 * `build.ssr` (boolean flag or string SSR-entry path), falling back to a
 * previously derived value, then to `configEnv.isSsrBuild`.
 *
 * A non-empty string `build.ssr` names an SSR entry — per Vite semantics that
 * makes the build an SSR build regardless of the string's content. Both
 * react-client plugin halves share this derivation so the two resolve
 * conditions can't drift apart.
 */
export function deriveImplicitSsr({
  buildSsr,
  isSsrBuild,
  previous,
}: {
  buildSsr: boolean | string | undefined;
  isSsrBuild: boolean | undefined;
  previous: boolean | undefined;
}): boolean | undefined {
  if (typeof buildSsr === "boolean") return buildSsr;
  if (typeof buildSsr === "string") return buildSsr !== "";
  return previous ?? isSsrBuild;
}
