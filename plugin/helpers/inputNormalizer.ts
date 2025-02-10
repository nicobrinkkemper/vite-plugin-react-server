import { join } from "path";
import { normalizePath } from "vite";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { InputNormalizer, NormalizerInput } from "../types.js";

export function createInputNormalizer(root: string): InputNormalizer {

  // Normalize a key by removing file extensions and leading slashes
  const normalizeKey = (key: string): string => {
    return key
      .replace(DEFAULT_CONFIG.FILE_REGEX, "") // Remove TypeScript/JavaScript extensions
      .replace(/^\/+/, ""); // Remove leading slashes
  };

  // Main normalize function
  return (input: NormalizerInput): [string, string] => {
    
    // Handle tuple input [key, path]
    if (Array.isArray(input)) {
      const [key, path] = input;
      const normalized: [string, string] = [
        normalizeKey(key),
        normalizePath(join(root, path))
      ] 
      return normalized;
    }

    // Handle string input
    if (typeof input === "string") {
      const key = normalizeKey(input);
      const path = normalizePath(join(root, input));  
      return [key, path];
    }

    throw new Error(`Invalid input type: ${typeof input}`);
  };
}
