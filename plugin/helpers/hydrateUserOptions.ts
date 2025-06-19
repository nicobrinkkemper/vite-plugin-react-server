import { DEFAULT_LOADER_CONFIG } from "../config/defaults.js";
import type { ResolvedUserOptions, SerializedUserOptions } from "../types.js";

function deserializeRegExp(pattern: { source: string; flags: string; __isRegExp: boolean } | RegExp | undefined): RegExp | undefined {
  if (!pattern) return undefined;
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern === 'object' && '__isRegExp' in pattern) {
    return new RegExp(pattern.source, pattern.flags);
  }
  return undefined;
}

export function hydrateUserOptions<T extends SerializedUserOptions>(
  options: T
): { type: "success"; userOptions: ResolvedUserOptions } | { type: "error"; error: Error } {
  try {
    // Deserialize RegExp patterns in autoDiscover
    const autoDiscover = {
      ...options.autoDiscover,
      modulePattern: deserializeRegExp(options.autoDiscover?.modulePattern),
      serverPattern: deserializeRegExp(options.autoDiscover?.serverPattern),
      clientPattern: deserializeRegExp(options.autoDiscover?.clientPattern),
      ...Object.fromEntries(
        Object.entries(options.autoDiscover ?? {})
          .filter(([key]) => !['modulePattern', 'serverPattern', 'clientPattern'].includes(key))
          .map(([key, value]) => [key, deserializeRegExp(value)])
      ),
    };

    // Deserialize RegExp patterns in loader
    const loader = {
      ...options.loader,
      serverDirective: deserializeRegExp(options.loader?.serverDirective),
      clientDirective: deserializeRegExp(options.loader?.clientDirective),
      isServerFunctionCode: DEFAULT_LOADER_CONFIG.isServerFunctionCode,
      isClientComponentCode: DEFAULT_LOADER_CONFIG.isClientComponentCode,
      allowedDirectives: DEFAULT_LOADER_CONFIG.allowedDirectives,
      getDirectiveType: DEFAULT_LOADER_CONFIG.getDirectiveType,
      mode: options.loader?.mode,
      importServerPath: options.loader?.importServerPath,
      importClientPath: options.loader?.importClientPath,
      registerClientReferenceName: options.loader?.registerClientReferenceName,
      registerServerReferenceName: options.loader?.registerServerReferenceName,
    };

    return {
      type: "success",
      userOptions: {
        ...options,
        autoDiscover,
        loader,
        ['Page']: options['Page'] ?? undefined,
        ['props']: options['props'] ?? undefined,
        ['Html']: options['Html'] ?? undefined,
        ['CssCollector']: options['CssCollector'] ?? undefined,
        ['onMetrics']: options['onMetrics'] ?? undefined,
        ['onEvent']: options['onEvent'] ?? undefined,
        ['normalizer']: options['normalizer'] ?? undefined,
      } as unknown as ResolvedUserOptions
    };
  } catch (error) {
    return {
      type: "error",
      error: error instanceof Error ? error : new Error("Failed to hydrate options")
    };
  }
} 