import path from "node:path";
import type { ConfigEnv, ResolvedConfig, UserConfig } from "vite";
import type { ResolvedUserOptions, StreamPluginOptions } from "./types.js";
// Default configuration values
export const DEFAULT_CONFIG = {
  FILE_REGEX: /\.(m|c)?(j|t)sx?$/,
  CLIENT_ASSETS_DIR: "assets",
  RSC_DIR: "rsc",
  MODULE_BASE: "src",
  MODULE_BASE_PATH: "/src",
  MODULE_BASE_URL: "/src",
  PAGE: "/src/page/page.tsx",
  PROPS: "/src/page/props.ts",
  CLIENT_ENTRY: "/src/client.tsx",
  PAGE_EXPORT: "Page",
  PROPS_EXPORT: "props",
  // relative from plugin root
  WORKER_PATH: "worker/worker.tsx",
  LOADER_PATH: "worker/loader.ts",
  RSC_EXTENSION: ".rsc",
  HTML: ({ children }: { children: any }) => children,
  COLLECT_CSS: true,
  COLLECT_ASSETS: true,
  PAGE_PATTERN: "/src/page/**/*.page.tsx",
  PROPS_PATTERN: "/src/page/**/*.props.ts",
  DEV_PORT: 5173,
  PREVIEW_PORT: 4173,
  DEV_HOST: "localhost",
  PREVIEW_HOST: "localhost",
  ENV_PREFIX: "VITE_",
  BUILD: {
    pages: () => ["/"],
    client: "dist/client",
    server: "dist/server",
  },
} as const;

export const resolveConfig = <T extends ResolvedConfig>(
  config: T,
  resolvedUserConfig: UserConfig,
  userOptions: ResolvedUserOptions
) => {
  return {
    ...config,
    build: {
      ...config.build,
      assetsDir: config.build?.assetsDir ?? DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
    },
  };
};

export const resolveUserConfig = (
  condition: "react-client" | "react-server",
  config: UserConfig,
  configEnv: ConfigEnv,
  userOptions: ResolvedUserOptions
):
  | { type: "error"; error: Error }
  | {
      type: "success";
      userConfig: Required<Pick<UserConfig, "root" | "build" | "mode">> &
        Omit<UserConfig, "root" | "build" | "mode">;
    } => {
  const isReactServer = condition === "react-server";
  const isViteServer = configEnv.command === "serve";
  const isViteSsrBuild = configEnv.isSsrBuild;
  const isVitePreview = configEnv.isPreview;
  const shouldBeReactServer = !!(isViteSsrBuild || isViteServer);

  if (userOptions.assetsDir !== config.build?.assetsDir) {
    return {
      type: "error",
      error: new Error(
        "assetsDir cannot be changed after the config has been resolved"
      ),
    };
  }
  if (isReactServer !== shouldBeReactServer) {
    if (configEnv.command === "build") {
      return {
        type: "error",
        error: new Error(
          "ssr must be true when using the server plugin, vite build --ssr"
        ),
      };
    } else if (!isReactServer && shouldBeReactServer) {
      return {
        type: "error",
        error: new Error(
          isViteServer
            ? `react-server condition was not set. Please use \`NODE_OPTIONS='--conditions react-server' vite${
                isVitePreview ? " preview" : ""
              }\``
            : "react-server condition was not set. Please use `NODE_OPTIONS='--conditions react-server' vite build --ssr`"
        ),
      };
    } else if (!shouldBeReactServer && isReactServer) {
      return {
        type: "error",
        error: new Error(
          "Vite was run with the react-server condition, but is making a client build."
        ),
      };
    }
  }
  const { root: configRoot, mode: configMode, ...configRest } = config;
  const { outDir: configOutDir, assetsDir: configAssetsDir, ssr: configSsr, manifest: configManifest, ssrManifest: configSsrManifest, target: configTarget, ...configBuildRest } = config.build;
  return {
    type: "success",
    userConfig: {
      ...configRest,
      root: configRoot ?? userOptions.projectRoot ?? process.cwd(),
      mode: configMode ?? process.env["NODE_ENV"] ?? "production",
      build: {
        ...configBuildRest,
        ssr: condition === "react-server",
        manifest: configManifest ?? true,
        ssrManifest: configSsrManifest ?? true,
        target: configTarget ?? "es2020",
        outDir:
          typeof configOutDir === "string"
            ? configOutDir
            : condition === "react-server"
            ? userOptions.build.server
            : userOptions.build.client,
        assetsDir:
          typeof configAssetsDir === "string"
            ? configAssetsDir
            : condition === "react-server"
            ? ''
            : DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
      },
    },
  };
};

export const resolveOptions = (
  options: StreamPluginOptions
):
  | { type: "error"; error: Error }
  | {
      type: "success";
      userOptions: ResolvedUserOptions;
    } => {
  const projectRoot = options.projectRoot ?? process.cwd();
  /** the module base can be assumed to not have a leading slash */
  const moduleBase =
    typeof options.moduleBase === "string"
      ? options.moduleBase.startsWith(path.sep)
        ? options.moduleBase.slice(path.sep.length)
        : options.moduleBase
      : DEFAULT_CONFIG.MODULE_BASE;

  if (
    typeof options.moduleBase === "string" &&
    options.moduleBase !== moduleBase
  ) {
    return {
      type: "error",
      error: new Error(
        `moduleBase ${options.moduleBase} is invalid, should be like ${moduleBase}`
      ),
    };
  }

  const moduleBasePath =
    typeof options.moduleBasePath === "string"
      ? !options.moduleBasePath.startsWith(path.sep)
        ? `${path.sep}${options.moduleBasePath}`
        : options.moduleBasePath
      : `${path.sep}${moduleBase}`;

  if (!moduleBasePath.includes(moduleBase)) {
    return {
      type: "error",
      error: new Error(
        `moduleBasePath ${moduleBasePath} is invalid, should include moduleBase ${moduleBase}`
      ),
    };
  }

  const moduleBaseURL =
    typeof options.moduleBaseURL === "string"
      ? !options.moduleBaseURL.endsWith(moduleBasePath)
        ? path.join(options.moduleBaseURL, moduleBasePath)
        : options.moduleBaseURL
      : moduleBasePath;

  if (!moduleBaseURL.includes(moduleBasePath)) {
    return {
      type: "error",
      error: new Error(
        `moduleBaseURL ${moduleBaseURL} is invalid, should include moduleBasePath ${moduleBasePath}`
      ),
    };
  }

  if (
    typeof options.moduleBaseURL === "string" &&
    options.moduleBaseURL !== moduleBaseURL
  ) {
    return {
      type: "error",
      error: new Error(
        `moduleBaseURL ${options.moduleBaseURL} is invalid, should be like ${moduleBaseURL}`
      ),
    };
  }

  const build = options.build
    ? {
        client: options.build.client ?? DEFAULT_CONFIG.BUILD.client,
        pages: options.build.pages ?? DEFAULT_CONFIG.BUILD.pages,
        server: options.build.server ?? DEFAULT_CONFIG.BUILD.server,
      }
    : DEFAULT_CONFIG.BUILD;

  return {
    type: "success",
    userOptions: {
      moduleBase,
      moduleBasePath,
      moduleBaseURL,
      build,
      Page: options.Page ?? DEFAULT_CONFIG.PAGE,
      props: options.props ?? DEFAULT_CONFIG.PROPS,
      Html: options.Html ?? DEFAULT_CONFIG.HTML,
      pageExportName: options.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT,
      propsExportName: options.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT,
      collectCss: options.collectCss ?? DEFAULT_CONFIG.COLLECT_CSS,
      collectAssets: options.collectAssets ?? DEFAULT_CONFIG.COLLECT_ASSETS,
      projectRoot: projectRoot,
      assetsDir: options.assetsDir ?? DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
    } satisfies ResolvedUserOptions,
  };
};



export async function resolvePages(
  pages: ResolvedUserOptions["build"]["pages"]
): Promise<
  | {
      type: "success";
      pages: string[];
    }
  | {
      type: "error";
      error: Error;
    }
> {
  if (!pages) {
    return {
      type: "success",
      pages: [],
    };
  }
  if (typeof pages === "function") {
    try {
      return resolvePages(await Promise.resolve(pages()));
    } catch (error) {
      return {
        type: "error",
        error:
          error instanceof Error
            ? error
            : new Error(
                `build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(
                  pages
                )}"`,
                {
                  cause: error,
                }
              ),
      };
    }
  }
  try {
    const result = pages;
    const awaited = "then" in result ? await result : result;
    if (typeof awaited === "string") {
      return {
        type: "success",
        pages: [awaited],
      };
    }
    if (Array.isArray(awaited)) {
      if (awaited.every((page) => typeof page === "string")) {
        return {
          type: "success",
          pages: awaited,
        };
      } else {
        return {
          type: "error",
          error: new Error(
            `build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(
              awaited.find((page) => typeof page !== "string")
            )}"`,
            {
              cause: awaited,
            }
          ),
        };
      }
    }
    return {
      type: "error",
      error: new Error(
        `build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(
          pages
        )}"`,
        {
          cause: pages,
        }
      ),
    };
  } catch (error) {
    return {
      type: "error",
      error:
        error instanceof Error
          ? error
          : new Error(
              `build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(
                error
              )}"`,
              {
                cause: error,
              }
            ),
    };
  }
}
