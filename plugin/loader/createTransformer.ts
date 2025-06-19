import type { Loader } from "./types.js";
import { transformModule } from "./transformModule.js";
import { DEFAULT_LOADER_CONFIG } from "../config/defaults.js";
import { getNodeEnv } from "../getNodeEnv.js";
import { isReactServerCondition } from "../config/getCondition.js";
import { parse } from "./directives/parse.js";
import type {
  ParseResult,
  Program,
  DirectiveInfo,
  DirectiveWarning,
  DirectiveMatch,
} from "./directives/types.js";
import { analyzeDirectives } from "./directives/analyzeDirectives.js";
import { getExports } from "./directives/getExports.js";
import { findDirectiveMatches } from "./directives/findDirectiveMatches.js";
import type { ResolvedUserOptions } from "../types.js";
import type { TransformerFactory, TransformResult } from "./types.js";

/**
 * Creates a transformer that handles React Server Components (RSC) boundaries.
 */
export const createTransformer: TransformerFactory = ({
  parseFn = parse,
  options,
  forceServerFunction = undefined,
  forceClientComponent = undefined,
  isServerEnvironment = isReactServerCondition(),
}) => {
  return async (source: string, moduleId: string): Promise<TransformResult> => {
    if (options.verbose) {
      console.log(`[createTransformer] Loading: ${moduleId}`);
    }
    // Fast-path: skip parsing and transformation if no directives are present
    const matches = await findDirectiveMatches(source);

    // Validate flags against matches
    const hasServerDirective = matches.matches.some((m: DirectiveMatch) => m.type === "server");
    const hasClientDirective = matches.matches.some((m: DirectiveMatch) => m.type === "client");

    if (hasClientDirective === false && hasServerDirective === false) {
      return { code: source, map: null };
    }
    let initialLineShift = 0;
    let warnings: DirectiveWarning[] = [];
    let removeClient = undefined as boolean | undefined;
    let removeServer = undefined as boolean | undefined;
    let appendClient = undefined as boolean | undefined;
    let appendServer = undefined as boolean | undefined;
    // Server function
    if (forceServerFunction === true && hasServerDirective === false) {
      appendServer = true;
    } else if (forceServerFunction === false && hasServerDirective === true) {
      removeServer = true;
    } else if (
      forceServerFunction === undefined &&
      hasServerDirective === true
    ) {
      forceServerFunction = true;
      if (hasClientDirective === true) {
        removeClient = true;
      }
    }
    // Client component
    if (forceClientComponent === true && hasClientDirective === false) {
      appendClient = true;
    } else if (forceClientComponent === false && hasClientDirective === true) {
      removeClient = true;
    } else if (
      forceClientComponent === undefined &&
      hasClientDirective === true
    ) {
      forceClientComponent = true;
      if (hasServerDirective === true) {
        removeServer = true;
      }
    }

    // Parse the module to get AST, code, and map
    const { ast, code, map } = await parseFn(source, options.verbose);
    const exports = await getExports(ast);
    const directiveInfo = analyzeDirectives(ast, source, {
      loader: options.loader,
      verbose: options.verbose
    }, moduleId);

    // Handle directive removal
    let transformedSource = source;
    if (removeServer || removeClient) {
      const serverMatches = matches.matches.filter((m: DirectiveMatch) => m.type === "server");
      const clientMatches = matches.matches.filter((m: DirectiveMatch) => m.type === "client");

      // Remove directives in reverse order to maintain correct indices
      if (removeServer) {
        for (const match of serverMatches.reverse()) {
          transformedSource =
            transformedSource.slice(0, match.range[0]) +
            transformedSource.slice(match.range[1]);
          warnings.push({
            type: "server",
            message: "Server directive removed",
            range: [match.range[0], match.range[1]],
          });
        }
      }
      if (removeClient) {
        for (const match of clientMatches.reverse()) {
          transformedSource =
            transformedSource.slice(0, match.range[0]) +
            transformedSource.slice(match.range[1]);
          warnings.push({
            type: "client",
            message: "Client directive removed",
            range: [match.range[0], match.range[1]],
          });
        }
      }
    }

    // Handle directive appending
    if (appendServer) {
      transformedSource = '"use server";\n' + transformedSource;
      warnings.push({
        type: "server",
        message: "Server directive added",
        range: [0, 0],
      });
    }
    if (appendClient) {
      transformedSource = '"use client";\n' + transformedSource;
      warnings.push({
        type: "client",
        message: "Client directive added",
        range: [0, 0],
      });
    }
    const needsHelpers =
      (appendServer || appendClient || removeServer || removeClient);
    const developmentHelpers = needsHelpers && getNodeEnv() !== "production"
      ? {
          directiveWarnings: warnings,
          addDirectives: appendServer
            ? (matches).matches.filter((m: DirectiveMatch) => m.type === "server").map((_: DirectiveMatch, i: number) => i)
            : appendClient
            ? (matches).matches.filter((m: DirectiveMatch) => m.type === "client").map((_: DirectiveMatch, i: number) => i)
            : undefined,
          removeDirectives: removeServer
            ? (matches).matches.filter((m: DirectiveMatch) => m.type === "server").map((_: DirectiveMatch, i: number) => i)
            : removeClient
            ? (matches).matches.filter((m: DirectiveMatch) => m.type === "client").map((_: DirectiveMatch, i: number) => i)
            : [],
        }
      : null;
    if(warnings.length > 0) {
      // throw first warning as error
      const error = new Error(warnings[0].message);
      Error.captureStackTrace(error, createTransformer);
      throw error;
    }

    // Transform the module
    const transformedCode = await transformModule(
      transformedSource,
      moduleId,
      {
        type: "success",
        ast,
        code,
        map,
        exports,
        directiveInfo,
      },
      {
        forceServerFunction: forceServerFunction ?? hasServerDirective,
        forceClientComponent: forceClientComponent ?? hasClientDirective,
        isServerEnvironment,
        loader: options.loader,
        directiveWarnings: warnings,
        verbose: options.verbose || false,
        ...developmentHelpers,
      }
    );
    return {
      code: transformedCode.code,
      map: transformedCode.map || null,
    };
  };
};
