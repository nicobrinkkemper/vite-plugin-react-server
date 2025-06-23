import { DEFAULT_CONFIG, BASE_PATTERNS } from "./defaults.js";

export const jsExtension = ".js";

export const replaceExtension = (id: string, options: {
  build: {
    extensionMap: Record<string, string>
  }
}) => {
  const buildConfig = options.build || DEFAULT_CONFIG.BUILD;
  const extensionMap = buildConfig.extensionMap || DEFAULT_CONFIG.BUILD.extensionMap;

  // Special handling for .node files
  if (id.includes(BASE_PATTERNS.EXT.NODE)) {
    return id.replace(new RegExp(`${BASE_PATTERNS.EXT.NODE}(?:\\.[^.]+)?$`), BASE_PATTERNS.EXT.NODE + jsExtension);
  }

  // Try extension mapping first (custom mappings should take precedence)
  if (extensionMap) {
    for (const [pattern, ext] of Object.entries(extensionMap)) {
      if (new RegExp(pattern).test(id)) {
        return id.replace(new RegExp(pattern), ext);
      }
    }
  }

  // Handle standard module extensions as fallback
  if (new RegExp(BASE_PATTERNS.MODULE).test(id)) {
    return id.replace(new RegExp(BASE_PATTERNS.MODULE), jsExtension);
  }

  return id;
};
