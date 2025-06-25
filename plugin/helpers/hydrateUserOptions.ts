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

function isSerializedRegExp(obj: unknown): obj is { source: string; flags: string; __isRegExp: boolean } {
  return (
    obj != null &&
    typeof obj === "object" &&
    '__isRegExp' in obj &&
    'source' in obj &&
    'flags' in obj &&
    obj.__isRegExp === true &&
    typeof obj.source === "string" &&
    typeof obj.flags === "string"
  );
}

export function hydrateUserOptions<T extends SerializedUserOptions>(
  options: T
): { type: "success"; userOptions: ResolvedUserOptions } | { type: "error"; error: Error } {
  try {
    // Deserialize RegExp patterns in autoDiscover (all keys)
    const autoDiscover = Object.fromEntries(
      Object.entries(options.autoDiscover ?? {}).map(([key, value]) => [key, deserializeRegExp(value) ?? value])
    );

    // Deserialize RegExp patterns in loader (main RegExp fields)
    const directivePatternValue = options.loader?.directivePattern;
    const loader = {
      ...options.loader,
      serverDirective: deserializeRegExp(options.loader?.serverDirective) ?? DEFAULT_LOADER_CONFIG.serverDirective,
      clientDirective: deserializeRegExp(options.loader?.clientDirective) ?? DEFAULT_LOADER_CONFIG.clientDirective,
      directivePattern:
        (directivePatternValue instanceof RegExp || isSerializedRegExp(directivePatternValue))
          ? deserializeRegExp(directivePatternValue)
          : DEFAULT_LOADER_CONFIG.directivePattern,
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
        ['Root']: options['Root'] ?? undefined,
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