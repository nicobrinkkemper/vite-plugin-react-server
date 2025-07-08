import type { RawSourceMap } from "source-map";
import type { DirectiveWarning, ParseResult, Program, AllowedDirectives } from "./directives/types.js";



export type LoaderConfig = {
  serverDirective: RegExp;
  clientDirective: RegExp;
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
  isServerFunctionCode: (code: string, moduleId?: string) => boolean;
  isClientComponentCode: (code: string, moduleId?: string) => boolean;
  parse: (source: string) => Promise<{
    ast: Program;
    code: string;
    map?: { url: string; start: number; end: number; lines: number } | null;
  }>;
};

export type RscLoader = Pick<LoaderConfig, 'importServerPath' | 'importClientPath' | 'registerClientReferenceName' | 'registerServerReferenceName'>;

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
  panicThreshold?: 'none' | 'critical_errors' | 'all_errors';
  mode?: "development" | "production" | "test";
};

export type TransformResult = {
  code: string;
  map: RawSourceMap | null;
};

export type TransformFunction = (
  source: string,
  moduleId: string,
  parseResult: ParseResult,
  options: TransformOptions
) => Promise<TransformResult>;

export type TransformerFactory = (options: {
  parseFn?: (source: string) => Promise<{ ast: Program; code: string; map?: {
    url: string;
    start: number;
    end: number;
    lines: number;
  } | null }>;
  options: Pick<TransformOptions, 'verbose' | 'loader' | 'panicThreshold'>;
  forceServerFunction?: boolean | undefined;
  forceClientComponent?: boolean | undefined;
  isServerEnvironment?: boolean;
}) => (source: string, moduleId: string) => Promise<TransformResult>;

export type { Program };