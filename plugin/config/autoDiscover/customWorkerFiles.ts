import { pluginRoot } from "../../root.js";
import type { ResolvedUserOptions } from "../../types.js";

/**
 * Logic to resolve custom worker files, when the path is not relative to the plugin root,
 * we assume it's a custom worker file and we need to add it to the inputs.
 * 
 * @param param0 
 * @returns 
 */
export const customWorkerFiles = ({
  inputs,
  userOptions,
}: {
  inputs: Record<string, string>;
  userOptions: Pick<ResolvedUserOptions, "rscWorkerPath" | "htmlWorkerPath">;
}) => {
  const customRscWorker = !userOptions.rscWorkerPath.startsWith(pluginRoot);
  const customHtmlWorker = !userOptions.htmlWorkerPath.startsWith(pluginRoot);
  if (customRscWorker && !inputs["rsc-worker"]) {
    inputs["rsc-worker"] = userOptions.rscWorkerPath;
  }
  if (customHtmlWorker && !inputs["html-worker"]) {
    inputs["html-worker"] = userOptions.htmlWorkerPath;
  }
  return inputs;
};
