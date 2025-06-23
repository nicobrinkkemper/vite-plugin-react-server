import { CssCollector } from "../components/css-collector.js";
import { Html } from "../components/html.js";
import { parse } from "../loader/parse.js";

// Directive patterns - matching the logic in findDirectiveMatches.ts
const DIRECTIVE_PATTERNS = {
  // Client directive must be at start of file
  CLIENT: /^\s*(?:"use client"|'use client')\s*(?:\n|;|$)/,
  // Server directive can be anywhere but must be properly terminated
  SERVER: /(?:"use server"|'use server')\s*(?:\n|;|$)/,
  // Generic pattern for both directives
  ANY: /(?:"use\s+(?:client|server)"|'use\s+(?:client|server)')\s*(?:\n|;|$)/g
} as const;

// Directive configurations
export const DIRECTIVE_CONFIGS = {
  client: {
    functionLevel: false,
    target: 'client' as const,
    validate: (params: { 
      code: string, 
      moduleId?: string,
      index: number,
      match: RegExpExecArray 
    }) => {
      // Client directive must be at very start of file
      return params.index === 0;
    },
    warning: "'use client' directive is only allowed at the top of a file"
  },
  server: {
    functionLevel: true,
    target: 'server' as const,
    validate: (params: { 
      code: string, 
      moduleId?: string,
      index: number,
      match: RegExpExecArray 
    }) => {
      // Check if directive is at start of file or after newline
      const before = params.code.slice(0, params.index).trim();
      return before === '' || before.endsWith('\n');
    },
    warning: "File-level directives must be at the top of the file, before any other code"
  }
} as const;

// Helper to get directive type from string
export const getDirectiveType = (directive: string): 'client' | 'server' | undefined => {
  if (directive.includes('client')) return 'client';
  if (directive.includes('server')) return 'server';
  return undefined;
};

// Helper to normalize directive strings
// const normalizeDirective = (directive: string) => directive.replace(/\s+/g, '').toLowerCase();

// Default loader configuration
export const DEFAULT_LOADER_CONFIG = {
  serverDirective: DIRECTIVE_PATTERNS.SERVER,
  clientDirective: DIRECTIVE_PATTERNS.CLIENT,
  directivePattern: DIRECTIVE_PATTERNS.ANY,
  isServerFunctionCode: (code: string, moduleId?: string) => 
    code.match(DIRECTIVE_PATTERNS.SERVER) != null || 
    (moduleId && /(\.|\/)?server(\.|\/)?/.test(moduleId.toLowerCase())) || 
    false,
  isClientComponentCode: (code: string, moduleId?: string) => 
    code.match(DIRECTIVE_PATTERNS.CLIENT) != null || 
    (moduleId && /(\.|\/)?client(\.|\/)?/.test(moduleId.toLowerCase())) || 
    false,
  allowedDirectives: DIRECTIVE_CONFIGS,
  importServerPath: "react-server-dom-esm/server",
  importClientPath: "react-server-dom-esm/server",
  registerClientReferenceName: "registerClientReference",
  registerServerReferenceName: "registerServerReference",
  getDirectiveType,
  parse: parse
} as const;

// Define base patterns that can be reused
export const BASE_PATTERNS = {
  MODULE: "\\.(m|c)?(j|t)sx?$",
  SERVER: "(?:\\.|\\/)?server(?:\\.(m|c)?(j|t)sx?)?$",
  CLIENT: "(?:\\.|\\/)?client(?:\\.(m|c)?(j|t)sx?)?$",
  PAGE: "(?:\\.|\\/)?(P|p)age(?:\\.(m|c)?(j|t)sx?)?$",
  PROPS: "(?:\\.|\\/)?props(?:\\.(m|c)?(j|t)sx?)?$",
  DIRECTIVE: "^\"use (client|server)\"[\\s;]*\\n?/m",
  VENDOR: "node_modules|@",
  VIRTUAL: "@",
  DOT_FILES: "\\.",
  EXT: {
    JS: ".js",
    CSS: ".css",
    CSS_MODULE: ".css.js",
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
  MODULE_BASE_PATH: "/",
  MODULE_BASE_URL: "/",
  PUBLIC_ORIGIN: "",
  PAGE: "page.tsx",
  PROPS: "props.ts",
  CLIENT_ENTRY: undefined,
  SERVER_ENTRY: undefined,
  PAGE_EXPORT_NAME: "Page",
  PROPS_EXPORT_NAME: "props",
  HTML_WORKER_PATH: `worker/html/html-worker.${
    process.env["NODE_ENV"] === "production" ? "production" : "development"
  }.js`,
  RSC_WORKER_PATH: `worker/rsc/rsc-worker.${
    process.env["NODE_ENV"] === "production" ? "production" : "development"
  }.js`,
  LOADER_PATH: "worker/loader.js",
  RSC_EXTENSION: ".rsc",
  CSS_COLLECTOR: CssCollector,
  HTML: Html,
  ON_METRICS: ()=>{},
  DEV_PORT: 5173,
  PREVIEW_PORT: 4173,
  DEV_HOST: "localhost",
  PREVIEW_HOST: "localhost",
  ENV_PREFIX: "VITE_",
  REACT_DIRECTIVES: new Set(["use client", "use server"]),
  RSC_TIMEOUT: 5000, // 5 seconds default timeout for RSC operations
  HTML_WORKER_STARTUP_TIMEOUT: 3000, // 3 seconds default timeout for HTML worker startup
  RSC_WORKER_STARTUP_TIMEOUT: 3000, // 3 seconds default timeout for RSC worker startup
  BUILD: {
    pages: [],
    client: "client",
    server: "server",
    static: "static",
    api: "api",
    outDir: "dist",
    assetsDir: "assets",
    hash: "",
    preserveModulesRoot: false,
    preserveDirectives: false,
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
      [BASE_PATTERNS.EXT.NODE]: BASE_PATTERNS.EXT.NODE,
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
    cssModuleExtension: BASE_PATTERNS.EXT.JS,
    nodeExtension: BASE_PATTERNS.EXT.NODE,
  },
  CSS: {
    inlineCss: false,
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
    cssPattern: new RegExp(`${BASE_PATTERNS.EXT.CSS}$`),
    jsonPattern: new RegExp(`${BASE_PATTERNS.EXT.JSON}$`),
    htmlPattern: new RegExp(`${BASE_PATTERNS.EXT.HTML}$`),
    rscPattern: new RegExp(`${BASE_PATTERNS.EXT.RSC}$`),
    nodeOnly: new RegExp(`${BASE_PATTERNS.EXT.NODE}$`),
    cssModulePattern: new RegExp(`${BASE_PATTERNS.EXT.CSS_MODULE}$`),
    vendorPattern: /^\/node_modules\//,
    virtualPattern: /^\/@\//,
    dotFiles: new RegExp(`${BASE_PATTERNS.DOT_FILES}`),
  },
  MODULE_ID: (id: string) => id,
  VERBOSE: false,
  // Centralized loader config for RSC boundaries
  RSC_LOADER: {
    development: {
      importServerPath: "react-server-dom-esm/server.node" as string,
      importClientPath: "react-server-dom-esm/server.node" as string,
      registerClientReferenceName: "registerClientReference" as string,
      registerServerReferenceName: "registerServerReference" as string
    },
    test: {
      importServerPath: "react-server-dom-esm/server.node" as string,
      importClientPath: "react-server-dom-esm/server.node" as string,
      registerClientReferenceName: "registerClientReference" as string,
      registerServerReferenceName: "registerServerReference" as string
    },
    production: {
      importServerPath: "react-server-dom-esm/server" as string,
      importClientPath: "react-server-dom-esm/server" as string,
      registerClientReferenceName: "registerClientReference" as string,
      registerServerReferenceName: "registerServerReference" as string
    }
  }
};