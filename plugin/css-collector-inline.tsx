import React from "react";
import { join } from "node:path";
import type { InlineCssCollectorProps } from "./types.js";
import { readFile } from "node:fs/promises";

interface CssContent {
  type?: string;
  content: string;
  key?: string;
  path: string;
}

/**
 * A component that loads and inlines CSS content asynchronously.
 */
function CssFileLoader({
  filePath,
  moduleRootPath,
}: {
  filePath: string;
  moduleRootPath: string;
}) {
  const cssPromise = React.cache(async () => {
    try {
      return await readFile(join(moduleRootPath, filePath), "utf-8");
    } catch (error) {
      console.error(`Failed to load CSS file ${filePath}:`, error);
      return ''; // Return empty string on error to prevent breaking the page
    }
  });

  const content = React.use(cssPromise());

  return content ? React.createElement(
    "style",
    {
      key: filePath,
      type: "text/css",
    },
    content
  ) : null;
}

/**
 * Batch loader component to handle multiple CSS files together
 */
function BatchCssLoader({
  files,
  moduleRootPath,
}: {
  files: string[];
  moduleRootPath: string;
}) {
  return React.createElement(
    React.Fragment,
    null,
    files.map(filePath => 
      React.createElement(CssFileLoader, {
        key: filePath,
        filePath,
        moduleRootPath,
      })
    )
  );
}

const seen = new Map<string, any>();
const BATCH_SIZE = 5; // Adjust this number based on performance testing

/**
 * A component that inlines pre-transformed CSS content.
 * Expects cssFiles to be an array of CssContent objects with the content already loaded.
 */
export function InlineCssCollector({
  children,
  cssFiles,
  moduleRootPath,
}: InlineCssCollectorProps) {
  // Group string files for batched loading
  const stringFiles: string[] = [];
  const otherElements: React.ReactNode[] = [];

  cssFiles.forEach((file, index) => {
    if (typeof file === "string") {
      if (seen.has(file)) {
        otherElements.push(seen.get(file));
        return;
      }
      
      if (process.env["NODE_ENV"] === "development") {
        const el = React.createElement("link", {
          key: file,
          rel: "stylesheet",
          href: file,
        });
        seen.set(file, el);
        otherElements.push(el);
        return;
      }
      
      stringFiles.push(file);
    } else {
      const { type, content, key, path } = file as CssContent;
      otherElements.push(
        React.createElement(
          "style",
          {
            key: key ?? path ?? index,
            type: type ?? "text/css",
            ...(process.env["NODE_ENV"] === "development" && {
              "data-vite-dev-id": join(moduleRootPath, path),
            }),
          },
          content
        )
      );
    }
  });

  // Split string files into batches
  const batches = [];
  for (let i = 0; i < stringFiles.length; i += BATCH_SIZE) {
    const batch = stringFiles.slice(i, i + BATCH_SIZE);
    const batchElement = React.createElement(
      React.Suspense,
      {
        key: `batch-${i}`,
        fallback: null,
      },
      React.createElement(BatchCssLoader, {
        files: batch,
        moduleRootPath,
      })
    );
    batches.push(batchElement);
  }

  return React.createElement(
    React.Fragment,
    null,
    ...batches,
    ...otherElements,
    children
  );
}
