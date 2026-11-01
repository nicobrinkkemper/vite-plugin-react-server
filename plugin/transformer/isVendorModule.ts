const testPattern = (pattern: RegExp, value: string) => {
  pattern.lastIndex = 0;
  return pattern.test(value);
};

/**
 * Whether a module id counts as a vendor file under `autoDiscover.vendorPattern`.
 *
 * The default pattern, `/^\/node_modules\//`, is written for a root-relative
 * path, but the bundler hands the transform an absolute id
 * (`/home/me/app/node_modules/react/index.js`, `C:\app\node_modules\…`,
 * `…/index.js?v=abc`). The pattern is tested against the id as given (so a
 * pattern written for absolute ids keeps working), then against the path
 * relative to the project root, then against that path from its first
 * `node_modules` directory (a nested install, or a hoisted monorepo install
 * above the root). The derived forms drop the query and use forward slashes.
 * Only the part below the root is searched for `node_modules`, so a project
 * that itself sits under a `node_modules` directory keeps its own files.
 */
export const isVendorModule = (
  pattern: RegExp,
  id: string,
  root: string
): boolean => {
  if (testPattern(pattern, id)) return true;
  const path = id.replace(/[?#].*$/, "").replace(/\\/g, "/");
  const base = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const relative = path.startsWith(base + "/") ? path.slice(base.length) : path;
  if (testPattern(pattern, relative)) return true;
  const nodeModules = relative.indexOf("/node_modules/");
  return nodeModules > 0 && testPattern(pattern, relative.slice(nodeModules));
};
