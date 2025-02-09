import type { StreamPluginOptions } from "../types.js"
import type { Plugin } from "vite"
import { reactHtmlWorkerPlugin } from "./html/plugin.js"
import { reactRscWorkerPlugin } from "./rsc/plugin.js"

/**
 * This plugin can be used to create your own worker paths. By default, prebuild workers are used.
 * 
 * @param options
 * @returns
 */
export function reactWorkerPlugin(options: StreamPluginOptions): Plugin[] {
  return [
    reactHtmlWorkerPlugin(options),
    reactRscWorkerPlugin(options)
  ]
}