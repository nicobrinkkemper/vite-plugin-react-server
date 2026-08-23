/**
 * Aliased over `node:fs/promises` and `node:path` when the edge bundles are
 * baked.
 *
 * The baked entries always supply `resolveServerReference` / `loadModule`, so
 * the disk-fallback branches that lazily import these modules
 * (handleServerAction's read-manifest-from-disk, the sealed gate's disk import)
 * are unreachable in a bake — but bundlers resolve even a dead dynamic
 * `import("node:fs/promises")` statically, and that one specifier is enough to
 * fail a Workers build of an otherwise Node-free bundle. Aliasing the dead
 * branches here removes the specifier; if one is ever reached anyway, the
 * throw below names the real problem instead of a runtime-missing-module error.
 *
 * The alias covers the WHOLE bundle, application modules included — a `use
 * server` action doing ordinary file IO lands here too, so the message serves
 * that caller first and the internal invariant second.
 */
const unreachable =
  (name: string) =>
  (): never => {
    throw new Error(
      `[edge] ${name} is not available inside the baked edge bundle: the ` +
        `bake targets isolates without a filesystem, so node:fs and ` +
        `node:path are stubbed out bundle-wide, application code included. ` +
        `Keep file access outside baked actions and reach platform data ` +
        `through the host's bindings. If nothing in the application calls ` +
        `this, a vprs disk-fallback branch was reached — the handler was ` +
        `invoked without the baked entry's own resolver.`
    );
  };

export const readFile = unreachable("node:fs/promises readFile");
export const join = unreachable("node:path join");
export const dirname = unreachable("node:path dirname");
export const resolve = unreachable("node:path resolve");
export const basename = unreachable("node:path basename");
// The action gate's `.server.` filename pattern can bake vprs's own request
// handler (the static file server) into a bundle that has actions; its names
// are then referenced at link time even when nothing serves files through the
// bake. (Its node:stream import is why that composition stays Node-bound —
// this stub only covers path/fs.)
export const extname = unreachable("node:path extname");
export const normalize = unreachable("node:path normalize");
// Referenced by isPathWithin (the action helper's disk-branch containment
// guard). Rollup requires every referenced name to EXIST at link time, even on
// branches it later tree-shakes away — so these must be exported. They still
// throw if actually called.
export const relative = unreachable("node:path relative");
export const isAbsolute = unreachable("node:path isAbsolute");
// A constant, so it cannot throw; "/" keeps any surviving pure string logic
// posix-correct.
export const sep = "/";
