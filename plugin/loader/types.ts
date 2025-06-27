import type { RawSourceMap } from "source-map";
import type { ResolvedUserOptions } from "../types.js";
import type { DirectiveWarning, ParseResult, Program } from "./directives/types.js";

export type RscLoader = Pick<ResolvedUserOptions['loader'], 'importServerPath' | 'importClientPath' | 'registerClientReferenceName' | 'registerServerReferenceName'>;

export type TransformOptions = {
  forceServerFunction: boolean;
  forceClientComponent: boolean;
  isServerEnvironment: boolean;
  loader: ResolvedUserOptions['loader'];
  directiveWarnings: DirectiveWarning[];
  // based on warning, remove warning directive index to avoid warning in development
  removeDirectives?: number[];
  // based on warning, add warning directive index to avoid warning in development
  addDirectives?: number[];
  verbose: boolean;
  failOnWarnings: boolean;
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
  options: Pick<ResolvedUserOptions, 'verbose' | 'loader' | 'failOnWarnings'>;
  forceServerFunction?: boolean | undefined;
  forceClientComponent?: boolean | undefined;
  isServerEnvironment?: boolean;
}) => (source: string, moduleId: string) => Promise<TransformResult>;

export type { Program };