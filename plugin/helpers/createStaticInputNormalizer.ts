import { join } from "node:path";
import type { InputNormalizer } from "../types.js";

interface StaticNormalizerOptions {
  root: string;
}

export function createStaticInputNormalizer({ root }: StaticNormalizerOptions): InputNormalizer {
  return (input) => {
    // Handle tuple input [key, path]
    if (Array.isArray(input)) {
      const [key, path] = input;
      // Keep the key as-is for Rollup entry point naming
      // Just resolve the path relative to root
      return [key, join(root, path)];
    }

    // Handle string input
    if (typeof input === "string") {
      // For single string inputs, let Rollup handle the naming
      return [input, join(root, input)];
    }

    throw new Error(`Invalid input type: ${typeof input}`);
  };
} 