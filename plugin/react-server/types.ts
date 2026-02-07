import type { Manifest, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  CreateHandlerOptions,
  ResolvedUserOptions,
} from "../types.js";
import type { IncomingMessage, ServerResponse } from "http";

export type HandleServerActionFn = (
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  handlerOptions: Pick<
    CreateHandlerOptions,
    "verbose" | "moduleBasePath" | "projectRoot" | "loader"
  >
) => Promise<void>;

export type ConfigureReactServerFn = (options: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
}) => void;
