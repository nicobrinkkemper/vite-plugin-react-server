import { transformModule } from "./transformModule.js";
import { transformNonServerEnvironment } from "./transformNonServerEnvironment.js";
import { isReactServerCondition } from "../config/getCondition.js";
import { analyzeModule } from "./directives/analyzeModule.js";
import { findDirectiveMatches } from "./directives/findDirectiveMatches.js";
import type { DirectiveMatch } from "./directives/types.js";
import type { TransformerFactory, TransformResult } from "./types.js";
import { DEFAULT_LOADER_CONFIG } from "../config/defaults.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { createLogger } from "vite";
import pkg from "picocolors";
const { red, underline } = pkg;

/**
 * Creates a transformer that handles React Server Components (RSC) boundaries.
 */
export const createTransformer: TransformerFactory = ({
  options,
  forceServerFunction = undefined,
  forceClientComponent = undefined,
  isServerEnvironment = isReactServerCondition(),
}) => {
  
  const {
    verbose,
    logger = createLogger(),
    loader = DEFAULT_LOADER_CONFIG,
  } = options;

  // Track if forceServerFunction/forceClientComponent were explicitly passed (for testing)
  // vs auto-detected from directives (for normal builds)
  const explicitForceServerFunction = forceServerFunction !== undefined;
  const explicitForceClientComponent = forceClientComponent !== undefined;

  return async (
    source: string,
    moduleId: string,
    // if a moduleID function is provided, use it to get the transformed module ID by default
    // otherwise, use the original module ID
    // can also be passed directly as a parameter
    transformedModuleId = loader?.moduleID?.(moduleId) ?? moduleId
  ): Promise<TransformResult> => {
    
    if (verbose) {
      logger.info(`[createTransformer] moduleID function called: ${moduleId} -> ${transformedModuleId}`);
    }
    if (verbose && moduleId.includes("client")) {
      logger.info(
        `[createTransformer:${
          isServerEnvironment ? "server" : "client"
        }] Loading: ${moduleId}`
      );
    }

    // Fast-path: skip parsing and transformation if no directives are present
    const matches = findDirectiveMatches(source);
    const hasServerDirective = matches.matches.some(
      (m: DirectiveMatch) => m.type === "server"
    );
    const hasClientDirective = matches.matches.some(
      (m: DirectiveMatch) => m.type === "client"
    );

    if (hasClientDirective === false && hasServerDirective === false) {
      // For files without directives, handle differently based on environment

      if (isServerEnvironment && loader?.isClientComponentByName?.(moduleId, transformedModuleId)) {
        // In server environment, client components without directives should be transformed to registerClientReference
        // This handles cases where client components don't have explicit "use client" directives
        // but are identified by file naming convention (.client.tsx)
        if (verbose) {
          logger.info(
            `[createTransformer:server] Transforming client file without directive: ${moduleId}`
          );
        }
        // Set forceClientComponent to true for client components identified by filename
        forceClientComponent = true;
        // Don't return early - let it fall through to transformModule
      } else if (
        !isServerEnvironment &&
        !hasClientDirective &&
        !hasServerDirective &&
        !loader?.isClientComponentByName?.(moduleId, transformedModuleId) &&
        !moduleId.includes("node_modules")
      ) {
        // In non-server environments, server components (modules without client/server directives and not client by name) should be hidden
        // This prevents server components from being loaded in client/ssr environments
        // But don't hide third-party modules from node_modules or modules with directives
        if (verbose) {
          logger.info(
            `[createTransformer:non-server] Hiding server component in non-server environment: ${moduleId}`
          );
        }
        // Return a module that exports null/undefined instead of empty string
        return { code: source, map: null };
      } else {
        // In client/ssr environments, we need to transform to remove directives
        // but we don't transform to registerClientReference
        if (hasClientDirective || hasServerDirective) {
          if (verbose) {
            logger.info(
              `[createTransformer:client] Transforming file with directives: ${moduleId}`
            );
          }
          // Transform to remove directives in client/ssr environment
          const parseResult = await analyzeModule(source, {
            ...options,
            logger,
            loader: loader,
          });

          if (parseResult.type === "success") {
            const result = await transformNonServerEnvironment(
              source,
              moduleId,
              transformedModuleId,
              parseResult,
              loader
            );
            if (verbose) {
              logger.info(
                `[createTransformer:client] Transformed result for ${moduleId}: ${result.code.substring(
                  0,
                  100
                )}`
              );
            }
            return result;
          }
        } else {
          // For files without directives in client/ssr environment, we still need to check
          // if this is a client component that should be transformed
          if (loader?.isClientComponentByName?.(moduleId, transformedModuleId)) {
            if (verbose) {
              logger.info(
                `[createTransformer:client] Transforming client component without directives: ${moduleId}`
              );
            }
            // Transform to ensure proper exports in client environment
            const parseResult = await analyzeModule(source, {
              ...options,
              logger,
              loader: loader,
            });

            if (parseResult.type === "success") {
              const result = await transformNonServerEnvironment(
                source,
                moduleId,
                transformedModuleId,
                parseResult,
                loader,
              );
              if (verbose) {
                logger.info(
                  `[createTransformer:client] Transformed result for ${moduleId}: ${result.code.substring(
                    0,
                    100
                  )}`
                );
              }
              return result;
            }
          }
        }
        // For files without directives and not identified as client components, keep original code
        return { code: source, map: null };
      }
    } else {
      // Set appropriate flags based on directives
      if (hasClientDirective) {
        forceClientComponent = true;
      }
      if (hasServerDirective) {
        forceServerFunction = true;
      }

      // Performance optimization: Check if file is already transformed to avoid unnecessary work
      // Only check this for files that actually have directives and are in the right environment
      if (isServerEnvironment && forceClientComponent) {
        const isAlreadyTransformed = source.includes(
          options?.loader?.registerClientReferenceName ??
            "registerClientReference"
        );

        if (isAlreadyTransformed) {
          logger.warn(
            `[createTransformer] File already transformed ${moduleId}. This call was not needed.`
          );
          return { code: source, map: null };
        }
      }
    }
    // Use analyzeModule to get the full parse result, passing the custom parseFn
    const parseResult = await analyzeModule(source, {
      ...options,
      logger,
      loader: loader,
    });
    if (
      parseResult.directiveInfo &&
      parseResult.directiveInfo.warnings.length > 0
    ) {
      const isProduction = getNodeEnv() === "production";

      // Handle directive errors (can be downgraded to warnings based on panicThreshold)
      for (const warning of parseResult.directiveInfo.warnings) {
        const shouldDowngradeToWarning =
          !isProduction && options.panicThreshold === "none";

        if (shouldDowngradeToWarning) {
          // Downgrade error to warning in development when panicThreshold is 'none'
          const [start, end] = warning.range;
          const lines = source.split("\n");
          const startLine = source.slice(0, start).split("\n").length;

          logger.warn(`Warning: ${warning.message}`);

          // Show document preview with line numbers
          const contextLines = 2; // Show 2 lines before and after
          const minLine = Math.max(1, startLine - contextLines);
          const maxLine = Math.min(lines.length, startLine + contextLines);

          for (let i = minLine; i <= maxLine; i++) {
            const lineNum = i.toString().padStart(3, " ");
            const isErrorLine = i === startLine;
            const prefix = isErrorLine ? ">" : " ";
            const line = lines[i - 1] || "";

            if (isErrorLine) {
              // Highlight the directive text itself using Vite's logger color methods
              const lineStart = source.lastIndexOf("\n", start - 1) + 1;
              const columnPos = Math.max(0, start - lineStart);
              const directiveLength = Math.max(1, end - start);

              // Split the line to highlight just the directive
              const beforeDirective = line.slice(0, columnPos);
              const directiveText = line.slice(
                columnPos,
                columnPos + directiveLength
              );
              const afterDirective = line.slice(columnPos + directiveLength);

              // Use picocolors for proper semantic coloring that adapts to themes
              logger.warn(
                `${prefix} ${lineNum} | ${beforeDirective}${red(
                  underline(directiveText)
                )}${afterDirective}`
              );
            } else if (line.trim() !== "") {
              logger.warn(`  ${lineNum} | ${line}`);
            }
          }
          logger.warn("");

          if (options.verbose) {
            logger.warn(`  range: [${start}, ${end}]`);
          }
        } else {
          // Treat as error (default behavior) - panic and stop compilation
          throw new Error(warning.message);
        }
      }
    }
    if (parseResult.type !== "success") {
      return { code: source, map: null };
    }

    // Transform the module
    // Only use explicit forceServerFunction/forceClientComponent in client environments
    // In client environments, auto-detected directives should go to transformNonServerEnvironment
    // (which throws errors for "use server" directives)
    const finalForceServerFunction = isServerEnvironment
      ? (forceServerFunction ?? hasServerDirective)
      : (explicitForceServerFunction ? forceServerFunction : undefined);
    const finalForceClientComponent = isServerEnvironment
      ? (forceClientComponent ?? hasClientDirective)
      : (explicitForceClientComponent ? forceClientComponent : undefined);

    return await transformModule(
      source,
      moduleId,
      transformedModuleId,
      parseResult,
      {
        forceServerFunction: finalForceServerFunction,
        forceClientComponent: finalForceClientComponent,
        isServerEnvironment,
        loader: options.loader,
        directiveWarnings: parseResult.directiveInfo.warnings,
        verbose: options.verbose || false,
        panicThreshold: options.panicThreshold || "none",
      }
    );
  };
};
