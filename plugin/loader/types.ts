import type { RawSourceMap } from "source-map";
import type { DirectiveWarning, ParseResult, Program, AllowedDirectives, ParsedExports } from "./directives/types.js";
import type { Logger } from "vite";
import type { PanicThreshold } from "../types.js";



export type LoaderConfig = {
  serverDirective: RegExp;
  clientDirective: RegExp;
  directivePattern: RegExp;
  allowedDirectives: AllowedDirectives;
  getDirectiveType: (
    directive: string,
    moduleId?: string
  ) => "client" | "server" | undefined;
  mode?: "development" | "production" | "test" | undefined;
  importServerPath?: string;
  importClientPath?: string;
  registerClientReferenceName?: string;
  registerServerReferenceName?: string;
  isServerFunctionCode: (code: string, moduleId?: string, transformedModuleId?: string) => boolean;
  isClientComponentCode: (code: string, moduleId?: string, transformedModuleId?: string) => boolean;
  isClientComponentByCode: (code: string) => boolean;
  isClientComponentByName: (moduleId: string, transformedModuleId?: string) => boolean;
  moduleID: (moduleId: string, sourceContent?: string) => string;
  parse: ParseFn;
  verbose?: boolean;
  logger?: Logger;
};

export type RscLoader = Pick<LoaderConfig, 'importServerPath' | 'importClientPath' | 'registerClientReferenceName' | 'registerServerReferenceName'>;

export type ParseFn = (source: string) => Program | { ast: Program; code?: string; map?: any; exports?: ParsedExports } | Promise<Program | { ast: Program; code?: string; map?: any; exports?: ParsedExports }>

export type TransformOptions = {
  forceServerFunction?: boolean;
  forceClientComponent?: boolean;
  isServerEnvironment?: boolean;
  loader?: LoaderConfig;
  directiveWarnings?: DirectiveWarning[];
  // based on warning, remove warning directive index to avoid warning in development
  removeDirectives?: number[];
  // based on warning, add warning directive index to avoid warning in development
  addDirectives?: number[];
  verbose?: boolean;
  panicThreshold?: PanicThreshold;
  mode?: "development" | "production" | "test";
  logger?: Logger;
  moduleBase?: string;
  // moduleID is on .loader.moduleID
  // moduleID?: (moduleId: string) => string;
};

export type TransformResult = {
  code: string;
  map: RawSourceMap | null;
};

export type TransformFunction = (
  source: string,
  moduleId: string,
  transformedModuleId: string,
  parseResult: ParseResult,
  options: TransformOptions,
) => Promise<TransformResult>;

export type TransformerFactory = (options: {
  parseFn?: ParseFn;
  options: Pick<TransformOptions, 'verbose' | 'loader' | 'panicThreshold' | 'logger' | 'moduleBase'>;
  forceServerFunction?: boolean | undefined;
  forceClientComponent?: boolean | undefined;
  isServerEnvironment?: boolean;
  ssr?: boolean;
  originalModuleId?: string;
}) => (source: string, moduleId: string, transformedModuleId?: string) => Promise<TransformResult>;

export type { Program };