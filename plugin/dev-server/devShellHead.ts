import type { HtmlTagDescriptor } from "vite";

/**
 * Stage-1 head-merge for the flash-free dev shell: the document/Html
 * component is the source of truth for <head>, and the dev index.html is only
 * the body scaffold. These helpers turn a RENDERED document (the same
 * pipeline output the static build freezes) into transformIndexHtml tags, and
 * reconcile the user's index.html against them.
 *
 * Input contract: React-rendered markup — well-formed, no conditional
 * comments, attributes quoted. This is not a general HTML parser and must
 * only ever be fed the document render's output.
 *
 * Scope is a whitelist: title, meta, link, inline style. Scripts are
 * deliberately excluded — the dev shell has Vite's own entry and HMR client,
 * and a document bootstrap script would double-load the app.
 */

const HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
const TAG_RE =
  /<(title|meta|link|style)\b([^>]*?)\/?>(?:([\s\S]*?)<\/\1>)?/gi;
const ATTR_RE = /([a-zA-Z-][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

function parseAttrs(raw: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    const [, name, dq, sq] = m;
    if (!name) continue;
    attrs[name] = dq ?? sq ?? true;
  }
  return attrs;
}

/**
 * Extract the whitelisted head elements of a rendered document as
 * transformIndexHtml tag descriptors (injectTo: "head").
 */
export function extractDocumentHeadTags(
  documentHtml: string
): HtmlTagDescriptor[] {
  const head = HEAD_RE.exec(documentHtml)?.[1];
  if (!head) return [];
  const tags: HtmlTagDescriptor[] = [];
  for (const m of head.matchAll(TAG_RE)) {
    const [, tag, rawAttrs, children] = m;
    const lower = tag.toLowerCase();
    // Void elements (meta/link) never have children; title/style keep theirs.
    const descriptor: HtmlTagDescriptor = {
      tag: lower,
      attrs: parseAttrs(rawAttrs ?? ""),
      injectTo: "head",
    };
    if ((lower === "title" || lower === "style") && children != null) {
      descriptor.children = children;
    }
    tags.push(descriptor);
  }
  return tags;
}

/**
 * Reconcile the user's index.html with the document-provided head.
 *
 * transformIndexHtml tags can only ADD, so collisions are resolved by
 * rewriting the served html: when the document supplies a <title> or a
 * charset meta, the copy in index.html is dropped. The document is the
 * source of truth — a kept title diverges silently, and a kept charset
 * sits next to the one Html always emits (`charset` vs `charSet`,
 * `UTF-8` vs `utf-8`), which React does not treat as the same tag.
 * Everything else is additive.
 */
const CHARSET_META_RE =
  /<meta\b[^>]*\bcharset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)[^>]*>\s*/gi;

/**
 * True when a head descriptor is a charset meta, in either React's
 * `charSet` prop name or the HTML `charset` attribute.
 */
function isCharsetMeta(tag: HtmlTagDescriptor): boolean {
  if (tag.tag !== "meta" || tag.attrs == null) return false;
  return "charset" in tag.attrs || "charSet" in tag.attrs;
}

export function mergeDevShellHead(
  indexHtml: string,
  documentTags: HtmlTagDescriptor[]
): { html: string; tags: HtmlTagDescriptor[] } {
  let html = indexHtml;
  if (documentTags.some((t) => t.tag === "title")) {
    html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/i, "");
  }
  if (documentTags.some(isCharsetMeta)) {
    html = html.replace(CHARSET_META_RE, "");
  }
  return { html, tags: documentTags };
}
