import { getCondition } from "./getCondition.js";
import type { CreateHandlerOptionsServerFn, CreateHandlerOptionsClientFn } from "./createHandlerOptions.types.js";

/**
 * Main createHandlerOptions function that automatically selects the appropriate implementation.
 * 
 * WHAT IT DOES:
 * - Uses Node.js conditions to determine the current environment (react-server vs react-client)
 * - Dynamically imports the correct implementation (.server.ts or .client.ts)
 * - Provides a unified API that works in both environments
 * - Automatically handles the environment-specific differences
 * 
 * HOW IT WORKS:
 * - In react-server environment: Uses createHandlerOptionsServer (for RSC streams)
 * - In react-client environment: Uses createHandlerOptionsClient (for HTML streams)
 * - The selection is automatic based on the Node.js condition
 * 
 * USAGE:
 * ```typescript
 * // Works in both environments automatically
 * const handlerOptions = await createHandlerOptions("/about", options);
 * // In react-server: Returns options for RSC stream creation
 * // In react-client: Returns options for HTML stream creation
 * ```
 * 
 * @param route - The route path (e.g., "/", "/about")
 * @param options - Configuration options
 * @returns Promise<CreateHandlerOptions> - Environment-appropriate handler options
 */
// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

// Dynamically import the appropriate createHandlerOptions implementation
export const { createHandlerOptions } = (await import(
  `${dirname}/createHandlerOptions.${condition}.js`
)) as {
  createHandlerOptions: CreateHandlerOptionsServerFn | CreateHandlerOptionsClientFn
};

// Re-export the types for convenience
export type {
  CreateHandlerOptionsParams,
  CreateHandlerOptionsServerFn,
  CreateHandlerOptionsClientFn,
} from "./createHandlerOptions.types.js";
