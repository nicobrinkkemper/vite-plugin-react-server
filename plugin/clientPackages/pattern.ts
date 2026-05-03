/**
 * Builds a regex matching `node_modules/<pkg>/...` paths for any package in
 * the given list. Returns `null` for an empty list (caller should treat as
 * "no whitelist active") so we don't have to special-case `/(?:)/.test(id)`
 * which matches every string.
 */
export const buildClientPackagesPattern = (
  packages: readonly string[]
): RegExp | null => {
  if (packages.length === 0) return null;
  const escaped = packages
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`[\\\\/]node_modules[\\\\/](?:${escaped})[\\\\/]`);
};
