import { Root } from "../components/root.js";
import { Html } from "../components/html.js";
import { parse } from "../loader/parse.js";
import { detectClientModule } from "../loader/directives/detectClientModule.js";
import { pluginRoot } from "../root.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { getCondition } from "./getCondition.js";
import { createLogger } from "vite";
const LOGGER = createLogger();
// Directive patterns - matching the logic in findDirectiveMatches.ts
const DIRECTIVE_PATTERNS = {
  // Client directive must be at start of file
  CLIENT: /^\s*(?:"use client"|'use client')\s*(?:\n|;|$)/,
  // Server directive can be anywhere but must be properly terminated
  SERVER: /(?:"use server"|'use server')\s*(?:\n|;|$)/,
  // Generic pattern for both directives
  ANY: /(?:"use\s+(?:client|server)"|'use\s+(?:client|server)')\s*(?:\n|;|$)/g,
} as const;

const SERVER_ACTION_FILE = /(\.|\/)?server(\.|\/)?/;
const IS_SERVER_ACTION_CODE = (code: string, moduleId?: string) =>
  code.match(SERVER_ACTION_FILE) != null ||
  (moduleId && SERVER_ACTION_FILE.test(moduleId.toLowerCase())) ||
  false;

// Defaults for the user-overridable `loader.isClientComponent*` hooks. All
// three delegate to the single detector at
// `loader/directives/detectClientModule`, which recognises a module as
// client when its filename matches `.client.[cm]?[jt]sx?$` OR its source
// declares a top-of-file `"use client"` directive (AST-validated when a
// parser is available, char-scanner otherwise). A path with "client" as a
// substring of an identifier, comment, or directory name (e.g.
// `src/lib/clientId.ts`) is NOT a client module.
const IS_CLIENT_COMPONENT_CODE = (code: string, moduleId?: string) =>
  detectClientModule({ source: code, moduleId });

const IS_CLIENT_COMPONENT_BY_CODE = (code: string) =>
  detectClientModule({ source: code });

const IS_CLIENT_COMPONENT_BY_NAME = (
  moduleId: string,
  _transformedModuleId?: string,
) => detectClientModule({ moduleId });
// Directive configurations
export const DIRECTIVE_CONFIGS = {
  client: {
    functionLevel: false,
    target: "client" as const,
    validate: (params: {
      code: string;
      moduleId?: string;
      index: number;
      match: RegExpExecArray;
    }) => {
      // Client directive must be at very start of file
      return params.index === 0;
    },
    warning: "'use client' directive is only allowed at the top of a file",
  },
  server: {
    functionLevel: true,
    target: "server" as const,
    validate: (params: {
      code: string;
      moduleId?: string;
      index: number;
      match: RegExpExecArray;
    }) => {
      // Check if directive is at start of file or after newline
      const before = params.code.slice(0, params.index).trim();
      return before === "" || before.endsWith("\n");
    },
    warning:
      "File-level directives must be at the top of the file, before any other code",
  },
} as const;

// Helper to get directive type from string
export const getDirectiveType = (
  directive: string
): "client" | "server" | undefined => {
  if (directive.includes("client")) return "client";
  if (directive.includes("server")) return "server";
  return undefined;
};

export const MODE = getNodeEnv();
export const CONDITION = getCondition();
export const IS_SERVER = CONDITION === "react-server";
export const IS_CLIENT = CONDITION === "react-client";
// Note: This should be replaced with configEnv.command === "build" in functions that receive configEnv
// This is kept for backward compatibility but should not be used in new code
export const IS_BUILD = process.argv.includes("build");
export const IS_SERVE = !IS_BUILD; // dont have to check for dev since it's the default

// Helper to normalize directive strings
// const normalizeDirective = (directive: string) => directive.replace(/\s+/g, '').toLowerCase();

// Default loader configuration
export const DEFAULT_LOADER_CONFIG = {
  serverDirective: DIRECTIVE_PATTERNS.SERVER,
  clientDirective: DIRECTIVE_PATTERNS.CLIENT,
  directivePattern: DIRECTIVE_PATTERNS.ANY,
  isServerFunctionCode: IS_SERVER_ACTION_CODE,
  isClientComponentCode: IS_CLIENT_COMPONENT_CODE,
  isClientComponentByCode: IS_CLIENT_COMPONENT_BY_CODE,
  isClientComponentByName: IS_CLIENT_COMPONENT_BY_NAME,
  allowedDirectives: DIRECTIVE_CONFIGS,
  importServerPath: "react-server-dom-esm/server",
  importClientPath: "react-server-dom-esm/server",
  registerClientReferenceName: "registerClientReference",
  registerServerReferenceName: "registerServerReference",
  getDirectiveType,
  parse: parse,
  mode: MODE,
  verbose: false,
  logger: LOGGER,
  moduleID: (moduleId: string, _sourceContent?: string) =>
    typeof moduleId === "string" ? moduleId : String(moduleId),
} as const;

// Define base patterns that can be reused
export const BASE_PATTERNS = {
  MODULE: "\\.(m|c)?(j|t)sx?$",
  SERVER: "(?:\\.|\\/)?server(?:\\.(m|c)?(j|t)sx?)?$",
  CLIENT: "(?:\\.|\\/)?client(?:\\.(m|c)?(j|t)sx?)?$",
  PAGE: "(?:\\.|\\/)?(P|p)age(?:\\.(m|c)?(j|t)sx?)?$",
  PROPS: "(?:\\.|\\/)?props(?:\\.(m|c)?(j|t)sx?)?$",
  DIRECTIVE: '^"use (client|server)"[\\s;]*\\n?/m',
  VENDOR: "node_modules|@",
  VIRTUAL: "@",
  DOT_FILES: "\\.",
  EXT: {
    JS: ".js",
    CSS: ".css",
    CSS_MODULE: ".module.css.js",
    JSON: ".json",
    HTML: ".html",
    RSC: ".rsc",
    NODE: ".node",
  },
} as const;
export const DEFAULT_CONFIG = {
  CLIENT_ASSETS_DIR: "assets",
  RSC_DIR: "rsc",
  MODULE_BASE: "src",
  // Both default to "/" so emitted client-reference moduleIDs ("/foo.client.js")
  // concatenate cleanly with the consumer's moduleBaseURL ("/") in
  // `react-server-dom-esm`'s client (literal string concat at
  // `react-server-dom-esm-client.*.development.js`). When MODULE_BASE_PATH was
  // "", `createModuleID`'s Step-5 prepend was skipped, the transformer's
  // hosting step added the leading "/" on its own, and the resulting
  // moduleID + moduleBaseURL combination produced "//foo.client.js" in dev —
  // browsers ESM-import that literally, Vite's dev catch-all returns its
  // index.html, and the module loader rejects on MIME mismatch
  // (`NS_ERROR_CORRUPTED_CONTENT`). Consumers that explicitly set
  // moduleBasePath (mmc historically did, bidoof always has) sidestepped it;
  // consumers leaning on the default tripped over it.
  MODULE_BASE_PATH: "/",
  MODULE_BASE_URL: "/",
  PUBLIC_ORIGIN: "",
  PAGE: "page.tsx",
  PROPS: "props.ts",
  CLIENT_ENTRY: undefined,
  SERVER_ENTRY: undefined,
  PAGE_EXPORT_NAME: "Page",
  PROPS_EXPORT_NAME: "props",
  HTML_EXPORT_NAME: "Html",
  ROOT_EXPORT_NAME: "Root",
  HTML_WORKER_PATH: `worker/html/html-worker.${
    process.env["NODE_ENV"] === "production" ? "production" : "development"
  }.js`,
  RSC_WORKER_PATH: `worker/rsc/rsc-worker.${
    process.env["NODE_ENV"] === "production" ? "production" : "development"
  }.js`,
  LOADER_PATH: "worker/loader.js",
  RSC_EXTENSION: ".rsc",
  ROOT: undefined,
  HTML: undefined,
  ON_METRICS: undefined,
  ON_EVENT: undefined,
  DEV_PORT: 5173,
  PREVIEW_PORT: 4173,
  DEV_HOST: "localhost",
  PREVIEW_HOST: "localhost",
  ENV_PREFIX: "VITE_",
  REACT_DIRECTIVES: new Set(["use client", "use server"]),
  RSC_TIMEOUT: 5000, // 5 seconds default timeout for RSC operations
  HTML_TIMEOUT: 15000, // 15 seconds default timeout for HTML generation operations
  HTML_WORKER_STARTUP_TIMEOUT: 3000, // 3 seconds default timeout for HTML worker startup
  RSC_WORKER_STARTUP_TIMEOUT: 3000, // 3 seconds default timeout for RSC worker startup
  FILE_WRITE_TIMEOUT: 10000, // 10 seconds default timeout for file write operations
  WORKER_SHUTDOWN_TIMEOUT: 1000, // Reduced to 1 second for faster test cleanup
  COMPONENTS: {
    Html: Html,
    Root: Root,
  },
  BUILD: {
    pages: [],
    client: "client",
    server: "server",
    static: "static",
    api: "api",
    outDir: "dist",
    assetsDir: "assets",
    hash: "hash",
    preserveModulesRoot: false,
    rscOutputPath: "index.rsc",
    htmlOutputPath: "index.html",
    extensionMap: {
      // Module patterns
      [BASE_PATTERNS.MODULE]: BASE_PATTERNS.EXT.JS,
      // Client/Server patterns
      [BASE_PATTERNS.CLIENT]: BASE_PATTERNS.EXT.JS,
      [BASE_PATTERNS.SERVER]: BASE_PATTERNS.EXT.JS,
      // File extensions
      [BASE_PATTERNS.EXT.CSS]: BASE_PATTERNS.EXT.CSS,
      [BASE_PATTERNS.EXT.JSON]: BASE_PATTERNS.EXT.JSON,
      [BASE_PATTERNS.EXT.HTML]: BASE_PATTERNS.EXT.HTML,
      [BASE_PATTERNS.EXT.RSC]: BASE_PATTERNS.EXT.RSC,
      [BASE_PATTERNS.EXT.NODE]: BASE_PATTERNS.EXT.NODE + BASE_PATTERNS.EXT.JS,
      // Special cases
      ".client": ".client" + BASE_PATTERNS.EXT.JS,
      ".server": ".server" + BASE_PATTERNS.EXT.JS,
    },
    moduleExtension: BASE_PATTERNS.EXT.JS,
    jsExtension: BASE_PATTERNS.EXT.JS,
    cssExtension: BASE_PATTERNS.EXT.CSS,
    htmlExtension: BASE_PATTERNS.EXT.HTML,
    jsonExtension: BASE_PATTERNS.EXT.JSON,
    rscExtension: BASE_PATTERNS.EXT.RSC,
    cssModuleExtension: BASE_PATTERNS.EXT.CSS_MODULE,
    nodeExtension: BASE_PATTERNS.EXT.NODE,
    // these defaults rely on process.argv
    // even better is to use configEnv.command === "build"
    // which will be done in createHandlerOptions.server.ts and createHandlerOptions.client.ts
    useRscWorker: !IS_SERVER && IS_BUILD,
    useHtmlWorker: IS_SERVER && IS_BUILD,
  },
  DEV: {
    // these defaults rely on process.argv
    useHtmlWorker: false, // during dev, the browser is the html-worker..
    // if the user opts-in to creating the html-worker, the stream utilities
    // will be able to stream html during development - the plugin never does this
    // so we don't have to create the html-worker during dev by default
    useRscWorker: !IS_SERVER && IS_SERVE, // during dev without server-conditions,
    // the rsc-worker is created during dev by default
    // this is because the rsc-worker is used to stream rsc during development
  },
  CSS: {
    inlineCss: undefined,
    purgeCss: false,
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [] as RegExp[], // Always inline CSS modules
    linkPatterns: [] as RegExp[], // Always link node_modules CSS
  },

  AUTO_DISCOVER: {
    clientEntry: "**/*.client.*",
    serverEntry: "**/*.server.*",
    cssEntry: "**/*.css",
    jsonEntry: "**/*.json",
    htmlEntry: "**/*.html",
    // Pattern matchers
    modulePattern: new RegExp(BASE_PATTERNS.MODULE),
    serverPattern: new RegExp(BASE_PATTERNS.SERVER),
    clientPattern: new RegExp(BASE_PATTERNS.CLIENT),
    pagePattern: new RegExp(BASE_PATTERNS.PAGE),
    propsPattern: new RegExp(BASE_PATTERNS.PROPS),

    // File patterns
    cssPattern: new RegExp(`\\${BASE_PATTERNS.EXT.CSS}$`),
    jsonPattern: new RegExp(`\\${BASE_PATTERNS.EXT.JSON}$`),
    htmlPattern: new RegExp(`\\${BASE_PATTERNS.EXT.HTML}$`),
    rscPattern: new RegExp(`\\${BASE_PATTERNS.EXT.RSC}$`),
    nodeOnly: new RegExp(`\\${BASE_PATTERNS.EXT.NODE}$`),
    cssModulePattern: new RegExp(
      `\\${BASE_PATTERNS.EXT.CSS}\\${BASE_PATTERNS.EXT.JS}$`
    ),
    vendorPattern: /^\/node_modules\//,
    virtualPattern: /^\/@\//,
    dotFiles: new RegExp(`${BASE_PATTERNS.DOT_FILES}`),
  },
  MODULE_ID: (id: string) => id,
  VERBOSE: false,
  PANIC_THRESHOLD: (MODE === "development"
    ? "critical_errors"
    : "all_errors") as "critical_errors" | "all_errors",
  // Centralized loader config for RSC boundaries
  RSC_LOADER: {
    development: {
      ...DEFAULT_LOADER_CONFIG,
      mode: "development" as const,
    },
    test: {
      ...DEFAULT_LOADER_CONFIG,
      importServerPath: "react-server-dom-esm/server.node",
      importClientPath: "react-server-dom-esm/server.node",
      mode: "test" as const,
    },
    production: {
      ...DEFAULT_LOADER_CONFIG,
      mode: "production" as const,
    },
  },
  REACT_LOADER_PATH: pluginRoot + "/loader/react-loader.js",
  CSS_LOADER_PATH: pluginRoot + "/loader/css-loader.js",
  ENV_LOADER_PATH: pluginRoot + "/loader/env-loader.js",
  
};
