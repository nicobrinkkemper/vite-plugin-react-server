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
import React from "react";
import type { ReactStreamHandlerFn } from "../types.js";
import { PassThrough } from "stream";

// The return type for the function
export type RenderStreamsReturn = [
  { type: "success"; stream: PassThrough; controller: { abort: () => void; destroy: () => void }; error?: never } | { type: "error"; error: Error; stream?: never; controller?: never },
  { type: "success"; stream: PassThrough; controller: { abort: () => void; destroy: () => void }; error?: never } | { type: "error"; error: Error; stream?: never; controller?: never }
];

// The function signature type
export type RenderStreamsFn = ReactStreamHandlerFn<never, RenderStreamsReturn>;

/**
 * Creates handlers for both document and RSC streams
 */
export const renderStreams: RenderStreamsFn = (handler) => {
  return [
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
    createHandler({ ...handler, HtmlComponent: React.Fragment }),
  ];
};
