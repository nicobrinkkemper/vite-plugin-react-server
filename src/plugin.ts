import { resolveOptions } from "./options.js";
import { viteReactClientTransformPlugin } from "./transformer/index.js";
import { preserveDirectives } from "./transformer/preserveDirectives.js";
import type { StreamPluginOptions } from "./types.js";

export const getCondition = (options: { env?: typeof process.env } = {}) => {
  const nodeOptions = options?.env?.['NODE_OPTIONS'] ?? process.env['NODE_OPTIONS'];
  return nodeOptions?.match(/--conditions=react-server/) ? "server" : "client";
};

export const reactStreamPlugin = async (options: StreamPluginOptions) => {
  const condition = getCondition();
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
