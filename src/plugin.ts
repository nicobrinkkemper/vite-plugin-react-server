import { resolveOptions } from "./options.js";
import { viteReactClientTransformPlugin } from "./transformer/index.js";
import { preserveDirectives } from "./transformer/preserveDirectives.js";
import type { StreamPluginOptions } from "./types.js";

export const condition = process.env["NODE_OPTIONS"]?.match(
  // regex for --conditions followed by react-server
  /--conditions=react-server/
)
  ? "server"
  : "client";

export const reactStreamPlugin = async (options: StreamPluginOptions) => {
  try {
    const resolvedOptions = resolveOptions(options);
    if (resolvedOptions.type === "error") {
      throw resolvedOptions.error;
    }
    options = resolvedOptions.userOptions;
  } catch (error) {
    throw new Error(
      `[vite:react-stream:${condition}] ${(error as Error).message}`
    );
  }
  return condition === "server"
    ? [
        (await import(`./react-server/plugin.js`)).reactStreamPlugin(options),
        viteReactClientTransformPlugin(),
        preserveDirectives(),
      ]
    : [(await import(`./react-client/plugin.js`)).reactStreamPlugin(options)];
};
