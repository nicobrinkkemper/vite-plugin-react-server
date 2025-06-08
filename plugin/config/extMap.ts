import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "./defaults.js";

export const extMap = (
  {
    moduleExtension,
    jsExtension,
    cssExtension,
    jsonExtension,
    htmlExtension,
    rscExtension,
  }: Pick<
    ResolvedUserOptions["autoDiscover"],
    | "moduleExtension"
    | "jsExtension"
    | "cssExtension"
    | "jsonExtension"
    | "htmlExtension"
    | "rscExtension"
  > = {
    moduleExtension: DEFAULT_CONFIG.AUTO_DISCOVER.moduleExtension,
    jsExtension: DEFAULT_CONFIG.AUTO_DISCOVER.jsExtension,
    cssExtension: DEFAULT_CONFIG.AUTO_DISCOVER.cssExtension,
    jsonExtension: DEFAULT_CONFIG.AUTO_DISCOVER.jsonExtension,
    htmlExtension: DEFAULT_CONFIG.AUTO_DISCOVER.htmlExtension,
    rscExtension: DEFAULT_CONFIG.AUTO_DISCOVER.rscExtension,
  }
) => {
  const map = {
    // should not have just .client as extension
    ".client": ".client" + jsExtension,
    // should not have just .server as extension
    ".server": ".server" + jsExtension,
    // these transform to js
    ".jsx": jsExtension,
    ".ts": jsExtension,
    ".tsx": jsExtension,
    ".mjs": jsExtension,
    ".cjs": jsExtension,
    ".mts": jsExtension,
    ".cts": jsExtension,
    ".css": cssExtension,
    ".json": jsonExtension,
    ".html": htmlExtension,
    ".rsc": rscExtension,
    // otherwise do nothing
  };
  return (id: string) => {
    const lastDotIndex = id.lastIndexOf(".");
    if (lastDotIndex === -1) {
      return id + jsExtension;
    }
    const ext = id.slice(lastDotIndex);
    const withoutExt = id.slice(0, lastDotIndex);
    if (ext in map) {
      return withoutExt + map[ext as keyof typeof map];
    }
    return id.replace(moduleExtension, jsExtension);
  };
};
