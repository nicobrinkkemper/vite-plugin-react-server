import React from "react";
/**
 * A component that emits <link> tags for CSS files during streaming.
 * The high precedence ensures they bubble up to the document head.
 */
export function CssCollector({
  children,
  cssFiles,
  moduleBaseUrl,
  route = "/"
}: {
  children?: React.ReactNode;
  cssFiles: string[];
  moduleBaseUrl?: string;
  route?: string;
}) {
  // Calculate depth and prefix based on route
  const depth = route.split('/').filter(Boolean).length ;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  const base = typeof moduleBaseUrl === 'string' && moduleBaseUrl !== '' ? moduleBaseUrl : prefix;

  return React.createElement(
    React.Fragment,
    null,
    ...cssFiles.map((css) => {
      try {
        if(moduleBaseUrl) {
          new URL(css, moduleBaseUrl);
        } else {
          new URL(`file://${base}${css}`);
        }
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
        url = base + css.slice(1);
      } else if (!css.startsWith('./') && !css.startsWith('../')) {
        // Add prefix to relative paths that don't start with ./ or ../
        url = base + css;
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
