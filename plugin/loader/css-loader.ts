import { readFile } from 'fs/promises';
import { basename } from 'path';
import postcss from 'postcss';
import type { MessagePort } from 'node:worker_threads';
import type { CssFileMessage } from '../worker/types.js';
import type { LoadHookContext } from 'node:module';

type LoaderContext = {
  data?: { port: MessagePort };
};
// Store port globally for CSS loader
let cssLoaderPort: MessagePort | undefined;

// Initialize hook
export async function initialize(data: { port: MessagePort }) {
  cssLoaderPort = data.port;  // Store port
  data.port.postMessage({ type: 'INITIALIZED' });
  data.port.unref();
}

// CSS file tracking per page
const cssFilesByPage = new Map<string, Set<string>>();
let currentPage: string | null = null;

export function setCurrentPage(page: string | null) {
  currentPage = page;
  if (page && !cssFilesByPage.has(page)) {
    cssFilesByPage.set(page, new Set());
  }
}

export function getCssFilesForPage(page: string): string[] {
  return Array.from(cssFilesByPage.get(page) || []);
}

// Modify the CSS handling in the load function
export async function load(url: string, context: LoadHookContext & LoaderContext, defaultLoad: any) {
  // Handle CSS files
  if(url.endsWith(".css")) {
    const source = await readFile(new URL(url), 'utf-8');
    
    // Process CSS with PostCSS
    const result = await postcss().process(source, {
      from: url,
      to: url,
      map: {
        inline: false,
        annotation: false
      }
    });

    // Generate both transformed CSS and class mappings
    const moduleName = basename(url, '.css').replace('.', '_');
    const classes: Record<string, string> = {};

    // Transform selectors
    result.root.walkRules(rule => {
      const selector = rule.selector.replace('.', '');
      const className = `${moduleName}_${selector}`;
      classes[selector] = className;
      rule.selector = `.${className}`;
    });

    // Get transformed CSS using root.toString()
    const transformedCss = result.root.toString();

    // Send processed CSS to worker
    if (cssLoaderPort) {
      cssLoaderPort.postMessage({
        type: 'CSS_FILE',
        id: url,
        cssFile: transformedCss
      } satisfies CssFileMessage);
    }
    
    // Return CSS module
    const moduleSource = `
      const styles = ${JSON.stringify(classes)};
      export default styles;
      export const css = ${JSON.stringify(transformedCss)};
    `;

    return {
      format: 'module',
      source: moduleSource,
      shortCircuit: true
    };
  }
  return defaultLoad(url, context, defaultLoad);
}

export function resolve(specifier: string, context: any, defaultResolve: any) {
  return defaultResolve(specifier, context, defaultResolve);
}


