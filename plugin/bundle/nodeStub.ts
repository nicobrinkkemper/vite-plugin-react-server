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
 */
const unreachable =
  (name: string) =>
  (): never => {
    throw new Error(
      `[edge] ${name} was called inside a baked bundle. These disk-fallback ` +
        `branches are unreachable when the baked entry provides its own ` +
        `resolver — reaching one means the handler was invoked without it.`
    );
  };

export const readFile = unreachable("node:fs/promises readFile");
export const join = unreachable("node:path join");
export const dirname = unreachable("node:path dirname");
export const resolve = unreachable("node:path resolve");
export const basename = unreachable("node:path basename");
// Referenced by isPathWithin (the action helper's disk-branch containment
// guard). Rollup requires every referenced name to EXIST at link time, even on
// branches it later tree-shakes away — so these must be exported. They still
// throw if actually called.
export const relative = unreachable("node:path relative");
export const isAbsolute = unreachable("node:path isAbsolute");
// A constant, so it cannot throw; "/" keeps any surviving pure string logic
// posix-correct.
export const sep = "/";
