/**
 * Derive the webpack-shaped client manifest from the client build's Vite
 * manifest.
 *
 * The webpack transport resolves a client reference by looking its `$$id` up
 * in a manifest of `{ id, chunks, name }` records. The transformer registers
 * references as `registerClientReference(proxy, hostedId, exportName)`, and
 * vprs's moduleID policy makes the hosted id the module's own served chunk
 * path (`moduleBasePath` + the built file) — the exact invariant the esm
 * transport's `import(moduleBaseURL + id)` already relies on. So the entire
 * map derives from the client `.vite/manifest.json`: every built module keys
 * itself, and `chunks` is its file plus the transitive `imports` closure (what
 * a browser must load before the module can execute).
 *
 * Keys are PER MODULE, not per export: the transport tries the exact `$$id`
 * first, then falls back to everything before the last `#` and carries the
 * export name through from the reference — so one record serves every export
 * of a module (measured against the vendored transport, not assumed).
 */

/** The subset of a Vite manifest entry this derivation reads. */
export type ViteManifestEntry = {
  file?: string;
  imports?: string[];
};

export type WebpackClientManifestEntry = {
  id: string;
  chunks: string[];
  name: string;
};

export type WebpackClientManifest = Record<string, WebpackClientManifestEntry>;

/** `moduleBasePath`-prefix a built file the same way the moduleID policy does. */
function hostedPath(moduleBasePath: string, file: string): string {
  const base = moduleBasePath.replace(/\/$/, "");
  return base + "/" + file;
}

/**
 * Build the webpack-shaped client manifest.
 *
 * @param manifest        the client build's `.vite/manifest.json` contents
 * @param moduleBasePath  the configured moduleBasePath ("/" by default) — the
 *                        prefix the moduleID policy puts on hosted ids
 */
export function buildWebpackClientManifest(
  manifest: Record<string, ViteManifestEntry | undefined>,
  moduleBasePath: string
): WebpackClientManifest {
  // Transitive `imports` closure per manifest key, memoized. `imports` holds
  // manifest KEYS (source-relative ids), so the closure resolves each to its
  // built file. Cycles are guarded by the shared `seen` set per root.
  const out: WebpackClientManifest = {};

  const closure = (key: string, seen: Set<string>, files: string[]): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const entry = manifest[key];
    if (!entry?.file) return;
    files.push(entry.file);
    for (const dep of entry.imports ?? []) closure(dep, seen, files);
  };

  for (const [key, entry] of Object.entries(manifest)) {
    // Only JS modules are referenceable; assets (css, images) ride along via
    // the entries' own metadata, not as client references.
    if (!entry?.file || !/\.[cm]?js$/.test(entry.file)) continue;
    const files: string[] = [];
    closure(key, new Set(), files);
    const hostedId = hostedPath(moduleBasePath, entry.file);
    out[hostedId] = {
      id: hostedId,
      // The module's own chunk first, then its dependency closure — the set a
      // consumer preloads via `__webpack_chunk_load__` before the sync require.
      chunks: files.map((f) => hostedPath(moduleBasePath, f)),
      name: "",
    };
  }
  return out;
}
