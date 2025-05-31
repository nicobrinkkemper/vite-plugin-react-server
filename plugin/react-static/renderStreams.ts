/**
 * renderStreams.ts
 *
 * PURPOSE: Creates specialized streams for React Server Components (RSC) rendering
 *
 * This module:
 * 1. Creates RSC stream (React.Fragment wrapper) for client-side navigation
 *    - This stream is saved to .rsc files and used when navigating between pages
 *    - The Fragment wrapper allows the browser to update only the necessary parts of the DOM
 *    - This is more efficient than reloading the entire HTML document
 * 2. Creates Document stream (Html wrapper) for initial page loads
 *    - This stream includes the full HTML document structure
 *    - Used for the initial page load when the browser needs the complete HTML
 * 3. Sets up stream handlers with proper wrappers and options
 * 4. Returns streams for renderPages to process
 */
import { createHandler } from "../helpers/createHandler.js";
import type {
  CreateHandlerOptions,
  PagePropOpt
} from "../types.js";
import React from "react";

/**
 * Creates handlers for both document and RSC streams
 *
 * @param handler The handler options for creating streams
 * @param options The render options
 * @returns A tuple containing the document worker result and RSC direct result
 */
export function renderStreams<
  T extends PagePropOpt = PagePropOpt
>(handler: CreateHandlerOptions<T>) {
  return Promise.all([
    /**
     * This stream goes to the document worker for client side rendering with full HTML structure,
     * links are already bubbled up in the static document which required us
     * to include the head in the stream as well
     */
    createHandler(handler),

    /**
     * This stream is saved to index.rsc file (if configured) and can be used
     * for navigating to pages (without the Html wrapper, but does contain
     * css/head information that can bubble up to the browser's dom)
     */
    createHandler({ ...handler, Html: React.Fragment }),
  ]);
}
