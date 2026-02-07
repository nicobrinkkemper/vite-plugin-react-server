/**
 * renderStreams.ts
 *
 * PURPOSE: Creates specialized streams for React Server Components (RSC) rendering
 *
 * This module:
 * 1. Creates Headless RSC stream (React.Fragment wrapper) for client-side navigation
 *    - This stream is saved to .rsc files and used when navigating between pages
 *    - The Fragment wrapper allows the browser to update only the necessary parts of the DOM
 *    - This is more efficient than reloading the entire HTML document
 * 2. Creates Full Document stream (Html wrapper) for initial page loads
 *    - This stream includes the full HTML document structure
 *    - Used for the initial page load when the browser needs the complete HTML
 * 3. Sets up stream handlers with proper wrappers and options
 * 4. Returns streams for renderPages to process
 */
import { createRenderToPipeableStreamHandler } from "../stream/createRenderToPipeableStreamHandler.server.js";
import type { RenderStreamsFn } from "./types.js";
import { assertReactServer } from "../config/getCondition.js";
import { React } from "../vendor/vendor.server.js";

assertReactServer()

/**
 * Creates handlers for both Full RSC and Headless RSC streams
 */
export const renderStreams: RenderStreamsFn = (handler) => {
  return [
    /**
     * This stream goes to the document worker for client side rendering with full HTML structure,
     * links are already bubbled up in the static document which required us
     * to include the head in the stream as well
     */
    createRenderToPipeableStreamHandler(handler),

    /**
     * This stream is saved to index.rsc file (if configured) and can be used
     * for navigating to pages (without the Html wrapper, but does contain
     * css/head information that can bubble up to the browser's dom)
     */
    createRenderToPipeableStreamHandler({ ...handler, HtmlComponent: React.Fragment }),
  ];
};
