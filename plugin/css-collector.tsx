import React from "react";
import { join } from "node:path";

/**
 * A component that emits <link> tags for CSS files during streaming.
 * The high precedence ensures they bubble up to the document head.
 */
export function CssCollector({
  children,
  cssFiles,
  moduleBaseURL,
  route = "/",
}: {
  children?: React.ReactNode;
  cssFiles: string[];
  moduleBaseURL?: string;
  route?: string;
}) {
  // Calculate depth and prefix based on route
  const depth = route.split('/').filter(Boolean).length;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  const base = typeof moduleBaseURL === 'string' && moduleBaseURL !== '' ? moduleBaseURL : prefix;

  const elements = cssFiles.map((file) => {
    // Handle pre-processed CSS content - skip in link mode
    if (typeof file === "object" && !React.isValidElement(file)) {
      return null;
    }
    // Handle string paths
    if (typeof file === "string" && file.endsWith('.css')) {
      // Handle different types of paths
      let url = file;
      if (file.startsWith('http') || file.startsWith('data:')) {
        // Keep absolute URLs as is
        url = file;
      } else if (file.startsWith('/')) {
        // Convert absolute paths to relative
        url = base + file.slice(1);
      } else if (!file.startsWith('./') && !file.startsWith('../')) {
        // Add prefix to relative paths that don't start with ./ or ../
        url = join(base, file);
      }
      
      return React.createElement("link", {
        key: file,
        rel: "stylesheet",
        href: url,
        precedence: "high",
      });
    }

    return null;
  }).filter(Boolean);

  return React.createElement(
    React.Fragment,
    null,
    ...elements,
    children
  );
}

