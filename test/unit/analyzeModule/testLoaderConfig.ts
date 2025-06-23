import { resolveOptions } from "../../../dist/plugin/config/resolveOptions.js";

export const testLoaderConfig = resolveOptions({
  moduleBase: "src",
  Page: "src/pages/Page.tsx",
  verbose: false,
  loader: {
    mode: "test" as const,
    importServerPath: "react-server-dom/server",
    importClientPath: "react-server-dom/client",
    registerClientReferenceName: "registerClientReference",
    registerServerReferenceName: "registerServerReference",
  }
}).userOptions!