import { resolveOptions } from "../config/resolveOptions.js";
import type { ResolvedUserOptions, SerializedUserOptions } from "../types.js";

export function hydrateUserOptions(
  options: SerializedUserOptions
): { type: "success"; userOptions: ResolvedUserOptions } | { type: "error"; error: unknown } {
  try {
    // resolveOptions already handles regex deserialization through deserializeRegExp()
    // Cast the serialized options back to the expected input format for resolveOptions
    const result = resolveOptions(options as any);
    
    if (result.type === "error") {
      return result;
    }
    
    // resolveOptions already creates the userOptions with all needed properties
    const userOptions = result.userOptions;
    
    return { type: "success", userOptions };
  } catch (error) {
    return { type: "error", error: error };
  }
}
