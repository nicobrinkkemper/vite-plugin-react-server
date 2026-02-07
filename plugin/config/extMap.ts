import { DEFAULT_CONFIG, BASE_PATTERNS } from "./defaults.js";

export const jsExtension = ".js";

export const replaceExtension = (id: string, options: {
  build: {
    extensionMap: Record<string, string>
  }
}) => {
  const buildConfig = options.build || DEFAULT_CONFIG.BUILD;
  const extensionMap = buildConfig.extensionMap || DEFAULT_CONFIG.BUILD.extensionMap;

  // Handle CSS files first - they should never be changed to .js
  if (id.endsWith('.css')) {
    return id; // Keep CSS files as .css
  }

  // Try extension mapping first (custom mappings should take precedence)
  if (extensionMap) {
    for (const [pattern, ext] of Object.entries(extensionMap)) {
      if(pattern.startsWith('.')) {
        // Simple extension pattern like ".css"
        const regex = new RegExp('\\' + pattern + (pattern.endsWith('$') ? '' : '$'));
        if (regex.test(id)) {
          return id.replace(regex, ext);
        }
      } else if (pattern.startsWith('\\.')) {
        // Regex pattern that starts with \. like "\.css$"
        const regex = new RegExp(pattern + (pattern.endsWith('$') ? '' : '$'));
        if (regex.test(id)) {
          return id.replace(regex, ext);
        }
      } else if (pattern.endsWith(":")) {
        // Pattern with colon
        const regex = new RegExp((id.startsWith('^') ? '' : '^') + pattern);
        if(regex.test(id)) {
          return id.replace(regex, ext);
        }
      } else {
        // Complex regex pattern like BASE_PATTERNS.MODULE
        const regex = new RegExp(pattern);
        if (regex.test(id)) {
          return id.replace(regex, ext);
        }
      }
    }
  }

  // Handle standard module extensions as fallback
  if (new RegExp(BASE_PATTERNS.MODULE).test(id)) {
    return id.replace(new RegExp(BASE_PATTERNS.MODULE), jsExtension);
  }

  return id;
};
