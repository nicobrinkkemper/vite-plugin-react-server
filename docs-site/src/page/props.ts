import { resolveTitle } from "./docs.js";

/**
 * Per-route props: the page picks its markdown by url; `title` feeds the
 * document <title> rendered by the Html wrapper (html.tsx).
 */
export const props = (url: string) => ({ url, title: resolveTitle(url) });
