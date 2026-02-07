import type { ResolvedUserOptions } from "../../types.js";
import { glob } from "node:fs/promises";
import { join, resolve } from "node:path";

export function createGlobAutoDiscover(pattern: string) {
  return async function _globAutoDiscover({
    inputs,
    userOptions,
  }: {
    inputs: Record<string, string>;
    userOptions: Pick<
      ResolvedUserOptions,
      "moduleBase" | "projectRoot" | "normalizer"
    >;
  }) {
    // Always use absolute paths to avoid uv_cwd errors
    // This is more reliable than trying to detect CWD availability
    const absolutePattern = resolve(userOptions.projectRoot, userOptions.moduleBase, pattern);
    const allFiles = glob(absolutePattern);
    
    for await (const file of allFiles) {
      // Convert absolute path back to relative path for normalizer
      const relativePath = file.replace(resolve(userOptions.projectRoot, userOptions.moduleBase), '').replace(/^\/+/, '');
      const [key, value] = userOptions.normalizer(
        join(userOptions.moduleBase, relativePath)
      );
      if (!inputs[key]) {
        inputs[key] = value;
      }
    }
    
    return inputs;
  };
}
