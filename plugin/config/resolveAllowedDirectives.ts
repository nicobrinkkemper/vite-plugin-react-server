

import type { AllowedDirectiveInput, AllowedDirectives, DirectiveConfig } from "react-server-loader/directives";


/**
 * Normalizes allowedDirectives to an object map.
 *
 * - "server" targets are always functionLevel: true
 * - "client" targets are always functionLevel: false
 * - Accepts:
 *   - Array of strings: ["client", "server", "foo"]
 *   - Array of tuples: [["myDirective", "client"], ["foo", "server"]]
 *   - AllowedDirectives object
 *
 * Example:
 *   resolveAllowedDirectives([
 *     "client",
 *     ["myDirective", "server"],
 *     "server"
 *   ])
 *   // =>
 *   {
 *     client: { functionLevel: false, target: "client" },
 *     myDirective: { functionLevel: true, target: "server" },
 *     server: { functionLevel: true, target: "server" }
 *   }
 */
export function resolveAllowedDirectives(
  input: AllowedDirectiveInput[] | AllowedDirectives | undefined
): AllowedDirectives {
  if (!input) return {};
  if (Array.isArray(input)) {
    return Object.fromEntries(
      input.map((entry) => {
        if (typeof entry === "string") {
          // Default: known client directives, else server
          if (entry === "client" || entry === "no-memo") {
            return [entry, { functionLevel: false, target: "client" } as DirectiveConfig];
          }
          return [entry, { functionLevel: true, target: "server" } as DirectiveConfig];
        }
        if (Array.isArray(entry) && entry.length === 2) {
          const [key, target] = entry;
          return [
            key,
            {
              functionLevel: target === "server",
              target,
            } as DirectiveConfig,
          ];
        }
        // fallback for any other object (shouldn't happen)
        return [String(entry), { functionLevel: true, target: "server" } as DirectiveConfig];
      })
    );
  }
  return input;
}
