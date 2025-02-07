import type { InputOption } from "rollup";

export function validateModuleBase(
  input: InputOption,
  moduleBase: string,
  moduleBaseExceptions: string[]
) {
  for (const [key, value] of Object.entries(input)) {
    const isException =
      moduleBaseExceptions.includes(key) || ["/index", "index"].includes(key);
    if (!key.includes("/")) return;
    if (value.startsWith("//")) {
      throw new Error(`Path shouldn't start with //`);
    }
    if (!key.startsWith(moduleBase) && !isException) {
      throw new Error(
        `Invalid input: ${key} does not start with ${moduleBase}. If this is a valid key, add it to moduleBaseExceptions otherwise put the file in the ${moduleBase} directory. Exception: ${moduleBaseExceptions.join(
          ", "
        )}`
      );
    }
    if (!value.startsWith("/" + moduleBase) && !isException) {
      throw new Error(
        `Invalid value: ${value} does not start with ${moduleBase}. If this is a valid path, add it to moduleBaseExceptions otherwise put the file in the ${moduleBase} directory. Exception: ${moduleBaseExceptions.join(
          ", "
        )}`
      );
    }
  }
}
