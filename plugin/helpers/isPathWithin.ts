import { relative, isAbsolute, sep } from "node:path";

/**
 * Containment guard. Returns true when `target` is `base` itself or resolves to
 * a path inside it. Use before importing or streaming a path derived from
 * client-supplied input: `join`/`resolve` collapse `../`, so a crafted id could
 * otherwise escape the expected root.
 *
 * Both arguments must already be absolute (the result of `join`/`resolve`).
 */
export function isPathWithin(base: string, target: string): boolean {
  const rel = relative(base, target);
  // An escape is `..` itself or anything below it (`../x`). Match the segment,
  // not a bare prefix, so a contained file whose name merely starts with `..`
  // (e.g. `..foo.ts`) is not falsely rejected.
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel))
  );
}
