import type { InputNormalizer, NormalizerInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { normalizePath } from "vite";

interface NormalizerOptions {
  root: string;
  moduleBase: string;
  moduleBaseExceptions?: string[];
}

export function createInputNormalizer({ 
  root,
  moduleBase,
  moduleBaseExceptions = []
}: NormalizerOptions): InputNormalizer {

  // Normalize a key by removing file extensions and leading slashes
  const normalizeKey = (key: string): string => {
    return key
      .replace(DEFAULT_CONFIG.FILE_REGEX, "") // Remove TypeScript/JavaScript extensions
      .replace(/^\/+/, ""); // Remove leading slashes
  };

  // Main normalize function
  return (input: NormalizerInput): [string, string] => {
    console.log("[inputNormalizer] Normalizing input:", input);
    
    // Handle tuple input [key, path]
    if (Array.isArray(input)) {
      const [key, path] = input;
      const normalized: [string, string] = [
        normalizeKey(key),
        normalizePath(path)
      ] 
      console.log("[inputNormalizer] Normalized input:", normalized);
      return normalized;
    }

    // Handle string input
    if (typeof input === "string") {
      const key = normalizeKey(input);
      const path = normalizePath(input);
      console.log("[inputNormalizer] Normalized input:", [key, path]);
      return [key, path];
    }

    throw new Error(`Invalid input type: ${typeof input}`);
  };
}
