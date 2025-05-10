import type { ResolvedUserOptions } from "../../types.js";
import { glob } from "node:fs/promises";
import { join } from "node:path";

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
    const allFiles = glob(pattern, {
      cwd: join(userOptions.projectRoot, userOptions.moduleBase),
    });
    for await (const file of allFiles) {
      const [key, value] = userOptions.normalizer(
        join(userOptions.moduleBase, file)
      );
      if (!inputs[key]) {
        inputs[key] = value;
      }
    }
    return inputs;
  };
}
