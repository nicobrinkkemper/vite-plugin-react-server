import { createElement } from 'react';

/**
 * A component that emits <link> tags for CSS files during streaming.
 * The high precedence ensures they bubble up to the document head.
 */
export function CssCollector({ url }: { url: string }) {
  return createElement('link', {
    key: url,
    rel: 'stylesheet',
    href: url,
    precedence: 'high'
  });
} 