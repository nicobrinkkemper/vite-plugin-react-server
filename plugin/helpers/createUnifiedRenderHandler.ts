import type { CreateHandlerOptions } from "../types.js";
import type { SerializableHandlerOptions } from "./createSerializableHandlerOptions.js";
import type { ResolvedComponents } from "./resolveComponentsFromPaths.js";
import { createSerializableHandlerOptions } from "./createSerializableHandlerOptions.js";
import { resolveComponentsFromPaths } from "./resolveComponentsFromPaths.js";
import { logRenderStart } from "./logRenderStart.js";
// import { createStreamTimeout } from "./createStreamTimeout.js";

export interface UnifiedRenderOptions {
  // Core options
  handlerOptions: CreateHandlerOptions;
  
  // Environment context
  environment: "client" | "server";
  context: "main-thread" | "worker-thread";
  
  // Component resolution strategy
  componentResolution: "direct" | "from-paths" | "message-based";
  
  // Stream handling
  streamTimeout?: number;
  verbose?: boolean;
  logger?: any;
}

export interface UnifiedRenderResult {
  success: boolean;
  error?: string;
  components?: ResolvedComponents;
  serializableOptions?: SerializableHandlerOptions;
  metrics?: any;
}

/**
 * Unified render handler that works across different environments
 * 
 * This handler provides a consistent interface for rendering operations
 * across client/server environments and main thread/worker thread scenarios.
 * 
 * ARCHITECTURE:
 * 
 * ENVIRONMENTS:
 * - Client: Static generation, build-time rendering
 * - Server: Runtime rendering, SSR
 * 
 * CONTEXTS:
 * - Main thread: Direct component access, immediate rendering
 * - Worker thread: Message-based communication, component loading
 * 
 * COMPONENT RESOLUTION STRATEGIES:
 * - Direct: Components passed directly (main thread)
 * - From paths: Components loaded from file paths (worker thread)
 * - Message-based: Components requested via messages (distributed)
 * 
 * @param options - Unified render options
 * @returns Promise resolving to render result
 */
export async function createUnifiedRenderHandler(
  options: UnifiedRenderOptions
): Promise<UnifiedRenderResult> {
  const {
    handlerOptions,
    environment,
    context,
    componentResolution,
    streamTimeout = 5000,
    verbose = false,
    logger,
  } = options;

  try {
    // Step 1: Log render start
    logRenderStart(
      handlerOptions.route,
      verbose,
      logger,
      `${environment}-${context}`
    );

    // Step 2: Create serializable options for worker communication
    const serializableOptions = createSerializableHandlerOptions(handlerOptions);

    // Step 3: Handle component resolution based on strategy
    let components: ResolvedComponents | undefined;

    switch (componentResolution) {
      case "direct":
        // Components are already available in handlerOptions
        components = {
          PageComponent: handlerOptions.PageComponent!,
          RootComponent: handlerOptions.RootComponent!,
          HtmlComponent: handlerOptions.HtmlComponent,
        };
        break;

      case "from-paths":
        // Load components from file paths (worker thread scenario)
        components = await resolveComponentsFromPaths({
          pagePath: handlerOptions.pagePath,
          rootPath: handlerOptions.rootPath,
          htmlPath: handlerOptions.htmlPath,
          pageExportName: handlerOptions.pageExportName,
          rootExportName: handlerOptions.rootExportName,
          htmlExportName: handlerOptions.htmlExportName,
          projectRoot: handlerOptions.projectRoot,
          moduleRootPath: handlerOptions.moduleRootPath,
          moduleBasePath: handlerOptions.moduleBasePath,
          logger,
          verbose,
        });
        break;

      case "message-based":
        // Components will be resolved through message communication
        // This is handled by the calling code
        break;

      default:
        throw new Error(`Unknown component resolution strategy: ${componentResolution}`);
    }

    // Step 4: Create stream timeout if needed
    // Note: This is a placeholder - actual stream timeout setup
    // would be done when streams are created
    if (streamTimeout > 0 && verbose && logger) {
      logger.info(`[unified-render] Stream timeout configured: ${streamTimeout}ms`);
    }

    // Step 5: Return unified result
    return {
      success: true,
      components,
      serializableOptions,
      metrics: {
        environment,
        context,
        componentResolution,
        streamTimeout,
      },
    };

  } catch (error) {
    if (verbose && logger) {
      logger.error(`[unified-render] Render failed:`, error);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Creates a render handler for main thread scenarios
 * 
 * @param handlerOptions - Full handler options with components
 * @param environment - Client or server environment
 * @param options - Additional options
 * @returns Promise resolving to render result
 */
export function createMainThreadRenderHandler(
  handlerOptions: CreateHandlerOptions,
  environment: "client" | "server",
  options: Partial<UnifiedRenderOptions> = {}
) {
  return createUnifiedRenderHandler({
    handlerOptions,
    environment,
    context: "main-thread",
    componentResolution: "direct",
    ...options,
  });
}

/**
 * Creates a render handler for worker thread scenarios
 * 
 * @param handlerOptions - Handler options (components will be loaded from paths)
 * @param environment - Client or server environment
 * @param options - Additional options
 * @returns Promise resolving to render result
 */
export function createWorkerThreadRenderHandler(
  handlerOptions: CreateHandlerOptions,
  environment: "client" | "server",
  options: Partial<UnifiedRenderOptions> = {}
) {
  return createUnifiedRenderHandler({
    handlerOptions,
    environment,
    context: "worker-thread",
    componentResolution: "from-paths",
    ...options,
  });
}
