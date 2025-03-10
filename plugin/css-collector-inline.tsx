import React from "react";
import { join } from "node:path";
import type {  InlineCssCollectorProps } from "./types.js";
import { readFileSync } from "node:fs";

interface CssContent {
  type?: string;
  content: string;
  key?: string;
  path: string;
}

/**
 * A component that inlines pre-transformed CSS content.
 * Expects cssFiles to be an array of CssContent objects with the content already loaded.
 */
export function InlineCssCollector({
  children,
  cssFiles,
  moduleRootPath,
}: InlineCssCollectorProps) {
  return React.createElement(
    React.Fragment,
    null,
    cssFiles.map((file, index) => {
      if (typeof file === "string") {
        let filePath = file as string;
        return React.createElement(
          "style",
          {
            key: file,
            type: "text/css",
          },
          readFileSync(join(moduleRootPath, filePath), "utf-8")
        );
      }

      const { type, content, key, path } = file as CssContent;
      return React.createElement(
        "style",
        {
          key: key ?? path ?? index,
          type: type ?? "text/css",
          ...(process.env["NODE_ENV"] === "development" && {
            "data-vite-dev-id": join(moduleRootPath, path),
          }),
        },
        content
      );
    }),
    children
  );
}
