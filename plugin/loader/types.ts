import type { RawSourceMap } from "source-map";
import type { ResolvedUserOptions } from "../types.js";
import type { DirectiveMatches, DirectiveWarning, ParseResult } from "./directives/types.js";

export type Loader = (
  url: string,
  context: any,
  defaultLoad: any
) => Promise<{
  format: string;
  source: string;
  map?: any;
}>;

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
  parseFn?: (source: string, verbose?: boolean) => Promise<{ ast: any; code: string; map?: any | null }>;
  options: Pick<ResolvedUserOptions, 'verbose' | 'loader'>;
  forceServerFunction?: boolean | undefined;
  forceClientComponent?: boolean | undefined;
  isServerEnvironment?: boolean;
}) => (source: string, moduleId: string) => Promise<TransformResult>;
