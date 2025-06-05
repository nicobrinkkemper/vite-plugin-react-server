import { CssCollector } from "../components/css-collector.js";
import { Html } from "../components/html.js";
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
  BUILD: {
    pages: [],
    client: "client",
    server: "server",
    static: "static",
    api: "api",
    outDir: "dist",
    assetsDir: "assets",
    hash: "hash",
    rscOutputPath: "index.rsc",
    htmlOutputPath: "index.html",
    preserveModulesRoot: true,
  },
  CSS: {
    inlineCss: false,
    purgeCss: false,
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [] as RegExp[], // Always inline CSS modules
    linkPatterns: [] as RegExp[], // Always link node_modules CSS
  },
  MODULE_BASE_EXCEPTIONS: [] as string[],
  DIRECTIVE_HANDLING: {
    preserveDirectives: true,
    customDirectives: [],
    validateFileLevel: (_node: any, index: number, program: any) => {
      // File-level directives must be at the top, before any non-directive statement
      for (let i = 0; i < index; i++) {
        const prev = program.body[i];
        if (prev.type !== "ExpressionStatement" || !("directive" in prev || (prev.expression && prev.expression.type === "Literal" && typeof prev.expression.value === "string"))) {
          return false;
        }
      }
      return true;
    },
    validateFunctionLevel: (node: any) => {
      // Function-level directives must be at the start of the function body
      if (!node || !node.body || !Array.isArray(node.body)) return false;
      const firstStmt = node.body[0];
      return firstStmt && firstStmt.type === "ExpressionStatement" && 
        ("directive" in firstStmt || (firstStmt.expression && firstStmt.expression.type === "Literal" && typeof firstStmt.expression.value === "string"));
    }
  },
  AUTO_DISCOVER: {
    // All REGEX tricks used here are based on the following:
    // $ = endsWith
    // ^ = startsWith
    // . = includes
    // \ = escape
    // ? = optional
    // () = group
    // | = or
    /**
     * /\.(m|c)?(j|t)sx?$/ and .lowerCase()
     */
    modulePattern: (n: string) => /\.(m|c)?(j|t)sx?$/.test(n.toLowerCase()),
    /**
     * /\.?page(\.(m|c)?(j|t)sx?)$/ and .lowerCase()
     */
    pagePattern: (n: string) => /\.?page(\.(m|c)?(j|t)sx?)$/.test(n.toLowerCase()),
    /**
     * /\.?props(\.(m|c)?(j|t)sx?)$/ and .lowerCase()
     */
    propsPattern: (n: string) => /\.?props(\.(m|c)?(j|t)sx?)$/.test(n.toLowerCase()), 
    /**
     * /(\.|\/)?client(\.(m|c)?(j|t)sx?)$/ and .lowerCase()
     */
    clientComponents: (n: string) => /(\.|\/)?client(\.(m|c)?(j|t)sx?)?$/.test(n.toLowerCase()),
    /**
     * /(\.|\/)?server(\.(m|c)?(j|t)sx?)$/ and .lowerCase()
     */
    serverFunctions: (n: string) => /(\.|\/)?server(\.(m|c)?(j|t)sx?)?$/.test(n.toLowerCase()),
    /**
     * /\.css$/
     */
    cssPattern: /\.css$/,
    /**
     * /\.css\.js$/
     */
    cssModulePattern: /\.css\.js$/,
    /**
     * /^\/@\//
     */
    virtualPattern: /^\/@\//,
    /**
     * /^\/node_modules\//
     */
    vendorPattern: /^\/node_modules\//,
    /**
     * /\.html$/
     */
    htmlPattern: /\.html$/,
    /**
     * /\.json$/
     */
    jsonPattern: /\.json$/,
    /**
     * /\.node(\.js)?$/
     */
    nodeOnly: /\.node(\.js)?$/,
    /**
     * /\.node(\.js)?$/
     */
    dotFiles: (n: string) => n.split('/').some(p => p.startsWith('.')), 
    /**
     * /\.rsc$/
     */
    rscPattern: /\.rsc$/,  
    /**
     * /\.(m|c)?(j|t)sx?$/
     */
    moduleExtension: /\.(m|c)?(j|t)sx?$/,
    /**
     * Matches "use server" or 'use server' with optional semicolon and newline
     */
    serverDirective: /(\"use server\"|\'use server\')[\s;]?/m,
    /**
     * Matches "use client" or 'use client' with optional semicolon and newline
     * Must be at start of file
     */
    clientDirective: /(\"use client\"|\'use client\')[\s;]?/m,
    /**
     * Custom directive patterns
     */
    customDirectives: [] as Array<{
      name: string;
      pattern: RegExp;
      validate?: (code: string, moduleId?: string) => boolean;
    }>,
    isServerFunctionCode: (code: string, moduleId?: string) => 
      code.match(DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective) != null || 
      (moduleId && DEFAULT_CONFIG.AUTO_DISCOVER.serverFunctions(moduleId)) || 
      false,
    isClientComponentCode: (code: string, moduleId?: string) => 
      code.match(DEFAULT_CONFIG.AUTO_DISCOVER.clientDirective) != null || 
      (moduleId && DEFAULT_CONFIG.AUTO_DISCOVER.clientComponents(moduleId)) || 
      false,
    jsExtension: ".js",
    cssExtension: ".css",
    jsonExtension: ".json",
    htmlExtension: ".html",
    rscExtension: ".rsc",
    
  },
  MODULE_ID: (id: string) => id,
  VERBOSE: false,
  // Centralized loader config for RSC boundaries
  RSC_LOADER: {
    importPath: "react-server-dom-esm/server" as string,
    registerClientReferenceName: "registerClientReference",
    registerServerReferenceName: "registerServerReference"
  }
} as const;