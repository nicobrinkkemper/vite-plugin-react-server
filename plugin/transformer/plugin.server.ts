import type { VitePluginFn } from "../types.js";
import { createTransformerPlugin } from "./createTransformerPlugin.js";

export const reactTransformPlugin: VitePluginFn = createTransformerPlugin({
  name: "server",
  defaultEnvironment: "server",
});
