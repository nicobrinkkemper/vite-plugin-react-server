import { Root } from "../components/root.js";
import { Html } from "../components/html.js";
import { parse } from "../loader/parse.js";
import { pluginRoot } from "../root.js";
import { getNodeEnv } from "./getNodeEnv.js";

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
const CLIENT_COMPONENT_FILE = /(\.|\/)?client(\.|\/)?/;
const IS_SERVER_ACTION_CODE = (code: string, moduleId?: string) =>
  code.match(SERVER_ACTION_FILE) != null ||
  (moduleId && SERVER_ACTION_FILE.test(moduleId.toLowerCase())) ||
  false;
const IS_CLIENT_COMPONENT_CODE = (code: string, moduleId?: string) =>
  code.match(CLIENT_COMPONENT_FILE) != null ||
  (moduleId && CLIENT_COMPONENT_FILE.test(moduleId.toLowerCase())) ||
  false;
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

export const MODE = getNodeEnv()

// Helper to normalize directive strings
// const normalizeDirective = (directive: string) => directive.replace(/\s+/g, '').toLowerCase();

// Default loader configuration
export const DEFAULT_LOADER_CONFIG = {
  serverDirective: DIRECTIVE_PATTERNS.SERVER,
  clientDirective: DIRECTIVE_PATTERNS.CLIENT,
  directivePattern: DIRECTIVE_PATTERNS.ANY,
  isServerFunctionCode: IS_SERVER_ACTION_CODE,
  isClientComponentCode: IS_CLIENT_COMPONENT_CODE,
  allowedDirectives: DIRECTIVE_CONFIGS,
  importServerPath: "react-server-dom-esm/server",
  importClientPath: "react-server-dom-esm/server",
  registerClientReferenceName: "registerClientReference",
  registerServerReferenceName: "registerServerReference",
  getDirectiveType,
  parse: parse,
  mode: MODE,
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
  MODULE_BASE_PATH: "",
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
  WORKER_SHUTDOWN_TIMEOUT: 5000, // 5 seconds default timeout for worker shutdown operations
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
  },
  CSS: {
    inlineCss: undefined,
    purgeCss: false,
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [] as RegExp[], // Always inline CSS modules
    linkPatterns: [] as RegExp[], // Always link node_modules CSS
  },
  MODULE_BASE_EXCEPTIONS: [] as string[],

  AUTO_DISCOVER: {
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
  PANIC_THRESHOLD: (MODE === "development" ? "critical_errors" : "all_errors") as "critical_errors" | "all_errors",
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
