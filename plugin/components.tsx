import React from "react";
import { join } from "node:path";
/**
 * A component that emits <link> tags for CSS files during streaming.
 * The high precedence ensures they bubble up to the document head.
 */
export function CssCollector({
  children,
  cssFiles,
  moduleBasePath = "/",
  route = "/"
}: {
  children?: React.ReactNode;
  cssFiles: string[];
  moduleBasePath?: string;
  route?: string;
}) {
  // Calculate depth and prefix based on route
  const depth = route.split('/').filter(Boolean).length;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';

  return React.createElement(
    React.Fragment,
    null,
    ...cssFiles.map((css) => {
      try {
        new URL(`file://${css}`);
      } catch (error) {
        return React.createElement('style', {type: 'text/css'}, 
          css
        );
      }
      // Handle different types of paths
      let url = css;
      if (css.startsWith('http') || css.startsWith('data:')) {
        // Keep absolute URLs as is
        url = css;
      } else if (css.startsWith('/')) {
        // Convert absolute paths to relative
        url = prefix + css.slice(1);
      } else if (!css.startsWith('./') && !css.startsWith('../')) {
        // Add prefix to relative paths that don't start with ./ or ../
        url = prefix + css;
      }
      
      return React.createElement("link", {
        key: css,
        rel: "stylesheet",
        href: url,
        precedence: "high",
      });
    }),
    children
  );
}
