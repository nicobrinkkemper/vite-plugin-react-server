import type { StreamPluginOptions } from "../types.js"
import type { Plugin } from "vite"
import { reactHtmlWorkerPlugin } from "./html/plugin.js"
import { reactRscWorkerPlugin } from "./rsc/plugin.js"

/**
 * This plugin can be used to create your own worker paths. This build should be separated from the main build.
 * 
 * 
 * ```ts
 * @example
 *export reactWorkerPluginConfig = {
 *  htmlWorkerPath: './workers/html.tsx',
 *  rscWorkerPath: './workers/rsc.tsx',
 * }
 * ```
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