import type { CreateHandlerOptions, AutoDiscoveredFiles } from "../types.js";
import type { Logger, UserConfig, ConfigEnv } from "vite";
import { resolveComponents } from "../helpers/resolveComponents.js";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { routeToURL } from "../utils/routeToURL.js";
import { resolveAutoDiscover } from "./autoDiscover/resolveAutoDiscover.js";
import {
  getStashedUserOptions,
  getStashedHandlerOptions,
  stashHandlerOptions,
  getEnvironmentId,
} from "./stashedOptionsState.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { createLogger } from "vite";

export async function createHandlerOptions(
  route: string,
  options: {
    mode?: "production" | "development" | "test";
    condition?: "react-server" | "react-client" | "";
    logger?: Logger;
    defaults?: any;
    config?: UserConfig;
    configEnv?: ConfigEnv;
    userOptions?: any;
    autoDiscoveredFiles?: AutoDiscoveredFiles;
    id?: string;
  } = {},
): Promise<CreateHandlerOptions> {
  const {
    mode = getNodeEnv(),
    condition = "react-server",
    logger = createLogger(),
    config,
    configEnv,
    id,
  } = options;

  // Early return if already cached
  const cachedOptions = getStashedHandlerOptions(route);
  if (cachedOptions) {
    return cachedOptions;
  }

  // Get the stashed userOptions for the current environment
  const envId = getEnvironmentId(condition, mode);
  const stashedOptions = getStashedUserOptions(envId);

  if (!stashedOptions) {
    throw new Error(
      `No stashed userOptions found for environment: ${envId}. Make sure resolveOptions() has been called first.`
    );
  }

  let { autoDiscoveredFiles } = options;

  if (!autoDiscoveredFiles) {
    const autoDiscoveredFilesResult = await resolveAutoDiscover({
      config: config || {},
      configEnv: configEnv || { mode: 'production', command: 'build' },    
      userOptions: stashedOptions,
      condition: condition === "react-server" ? "react-server" : "react-client",
      logger,
    });
    if (autoDiscoveredFilesResult.type === "error") {
      throw autoDiscoveredFilesResult.error;
    }
    autoDiscoveredFiles = autoDiscoveredFilesResult.autoDiscoveredFiles;
  }

  const url = routeToURL(
    route,
    stashedOptions.moduleBaseURL,
    stashedOptions.build.rscOutputPath
  );

  // Resolve actual file paths for this route
  const routeFilesResult = await getRouteFiles(
    route,
    autoDiscoveredFiles,
    stashedOptions,
    logger
  );

  if (routeFilesResult.type === "error") {
    throw routeFilesResult.error;
  }

  const {
    page: pagePath,
    props: propsPath,
    root: rootPath,
    html: htmlPath,
  } = routeFilesResult;

  // Determine the environment for loader creation
  const intermediateOptions = {
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    pageExportName: stashedOptions.pageExportName,
    propsExportName: stashedOptions.propsExportName,
    rootExportName: stashedOptions.rootExportName,
    htmlExportName: stashedOptions.htmlExportName,
    route,
    loader:
      condition === "react-server"
        ? async (moduleId: string) => {
            // we should at least handle the # Fragment validity check here, but dont change
            // the imported module, just verify its there and throw if its not.
            if (moduleId.includes("#")) {
              const [modulePath, fragment] = moduleId.split("#");
              const mod = await import(modulePath);
              if (!fragment.length) {
                return mod;
              }
              if (mod == null || typeof mod !== "object") {
                throw new Error(`${modulePath} is not a valid module`);
              }
              if (!(fragment in mod)) {
                throw new Error(
                  `${modulePath} does not export \"${fragment}\"`
                );
              }
              return mod[fragment];
            }
            return await import(moduleId);
          }
        : ((() => Promise.resolve({})) as any), // react-client doesn't import server modules
    verbose: stashedOptions.verbose,
    moduleBaseURL: stashedOptions.moduleBaseURL,
    build: stashedOptions.build,
    logger: logger,
    // Use component overrides from stashed options if available
    RootComponent: stashedOptions.components?.Root,
    HtmlComponent: stashedOptions.components?.Html,
  };

  // Resolve components using the intermediate options
  const componentsResult = await resolveComponents(intermediateOptions);

  if (componentsResult.type === "error") {
    throw componentsResult.error;
  }

  // Construct proper CreateHandlerOptions with all required properties
  const handlerOptions: CreateHandlerOptions = {
    ...stashedOptions,
    ...componentsResult,
    ...intermediateOptions, // Use the intermediateOptions instead of duplicating
    id, // Add the unique ID for worker communication
    url,
    cssFiles: new Map(), // Will be populated by the handler
    globalCss: new Map(), // Will be populated by the handler
    manifest: {}, // Will be populated by the handler
    // Ensure required components are set (componentsResult has the resolved ones)
    RootComponent: componentsResult.RootComponent,
    HtmlComponent: componentsResult.HtmlComponent,
  };

  // Cache the handler options
  stashHandlerOptions(route, handlerOptions);

  // Return the resolved handler options
  return handlerOptions;
} 