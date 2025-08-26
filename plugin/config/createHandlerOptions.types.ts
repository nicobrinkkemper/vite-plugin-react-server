import type { CreateHandlerOptions, AutoDiscoveredFiles, ResolvedUserOptions } from "../types.js";
import type { Logger,  ConfigEnv, ResolvedConfig } from "vite";

/**
 * Common parameters for both server and client createHandlerOptions functions.
 * 
 * The main difference is in the `loader` parameter:
 * - Server: Can use `server.ssrLoadModule` to load server modules directly
 * - Client: Usually empty since client can't load server modules
 */
export interface CreateHandlerOptionsParams {
  mode?: "production" | "development" | "test";
  logger?: Logger;
  defaults?: Partial<{
    pageExportName: string;
    propsExportName: string;
    rootExportName: string;
    htmlExportName: string;
    cssFiles: Map<string, any>;
    globalCss: Map<string, any>;
    manifest: Record<string, any>;
    css: any;
    loader?: any;
  }>;
  config?: ResolvedConfig ;
  configEnv?: ConfigEnv;
  envId?: string;
  userOptions?: ResolvedUserOptions;
  autoDiscoveredFiles?: AutoDiscoveredFiles;
  id?: string;
  children?: any;
}

/**
 * Server-specific handler options creation function.
 * 
 * WHAT IT DOES:
 * - Resolves file paths for server-side components (page.tsx, props.ts, etc.)
 * - Sets up handler options for RSC (React Server Components) stream creation
 * - Configures the environment for direct server module loading
 * - Sets HtmlComponent: undefined (server loads components at runtime)
 * - Uses server-specific paths and configurations
 * - Caches options by unique ID for performance
 * 
 * WHAT IT DOESN'T DO:
 * - Does NOT load or instantiate React components (that happens in createHandler)
 * - Does NOT create streams (that's handled by createHandler)
 * - Does NOT handle HTML generation (that's the client's job)
 * - Does NOT provide component placeholders
 * 
 * USAGE:
 * ```typescript
 * // In react-server environment (development server, SSR)
 * const handlerOptions = await createHandlerOptionsServer("/about", {
 *   defaults: { loader: server.ssrLoadModule }
 * });
 * // Result: Ready for RSC stream creation via createHandler
 * ```
 * 
 * @param route - The route path (e.g., "/", "/about")
 * @param options - Configuration options
 * @returns Promise<CreateHandlerOptions> - Handler options for RSC stream creation
 */
export type CreateHandlerOptionsServerFn = (
  route: string,
  options?: CreateHandlerOptionsParams
) => Promise<CreateHandlerOptions & {url: string}>

/**
 * Client-specific handler options creation function.
 * 
 * WHAT IT DOES:
 * - Resolves file paths for client-side components and assets
 * - Sets up handler options for HTML stream creation
 * - Configures the environment for client-side rendering
 * - Provides component placeholders (HtmlComponent: undefined, PageComponent: undefined, etc.)
 * - Sets up pageProps with URL for client-side hydration
 * - Uses client-specific paths and configurations
 * - Caches options by unique ID for performance
 * 
 * WHAT IT DOESN'T DO:
 * - Does NOT load or instantiate React components (that happens in workers)
 * - Does NOT create streams (that's handled by createHandler)
 * - Does NOT handle RSC generation (that's the server's job)
 * - Does NOT provide actual component implementations
 * 
 * USAGE:
 * ```typescript
 * // In react-client environment (build-time, static generation)
 * const handlerOptions = await createHandlerOptionsClient("/about", {
 *   defaults: { loader: () => Promise.resolve({}) }
 * });
 * // Result: Ready for HTML stream creation via createHandler
 * ```
 * 
 * @param route - The route path (e.g., "/", "/about")
 * @param options - Configuration options
 * @returns Promise<CreateHandlerOptions> - Handler options for HTML stream creation
 */
export type CreateHandlerOptionsClientFn = (
  route: string,
  options?: CreateHandlerOptionsParams
) => Promise<CreateHandlerOptions & {url: string}>;

/**
 * Resolved defaults for handler options creation.
 */
export interface ResolvedDefaults {
  pageExportName: string;
  propsExportName: string;
  rootExportName: string;
  htmlExportName: string;
  cssFiles: Map<string, any>;
  globalCss: Map<string, any>;
  manifest: Record<string, any>;
  css: any;
  loader?: any;
}
