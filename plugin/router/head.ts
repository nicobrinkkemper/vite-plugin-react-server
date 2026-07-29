/**
 * The `head.ts` route convention: a segment contributes head/meta for itself
 * and (unless overridden) its children. Contributions merge root→leaf — the
 * deepest segment wins the title, and a meta entry keyed by `name`/`property`
 * overrides an ancestor's entry with the same key. Rendered as react-dom
 * hoistable tags, so they land in the document `<head>` on every render path.
 */

export type RouteHeadContribution = {
  title?: string;
  /** `<meta>` attribute maps, e.g. `{ name: "description", content: "…" }`. */
  meta?: Array<Record<string, string>>;
  /** `<link>` attribute maps, e.g. `{ rel: "canonical", href: "…" }`. */
  links?: Array<Record<string, string>>;
};

/** Loader context a functional `head` export receives. */
export type RouteHeadCtx = {
  url: string;
  params: Record<string, string>;
  /** The segment's resolved loader data (its `props.ts` result). */
  data: Record<string, unknown>;
};

/** What a `head.ts` may export: a static object or a per-request function. */
export type RouteHeadExport =
  | RouteHeadContribution
  | ((ctx: RouteHeadCtx) => RouteHeadContribution | Promise<RouteHeadContribution>);

const metaKey = (m: Record<string, string>) =>
  m["name"] ?? m["property"] ?? m["httpEquiv"] ?? m["http-equiv"];

/** Merge root→leaf contributions: leaf title wins, keyed meta overrides. */
export function mergeHead(
  chain: Array<RouteHeadContribution | undefined>,
): RouteHeadContribution {
  let title: string | undefined;
  const meta = new Map<string | undefined, Record<string, string>[]>();
  const links: Array<Record<string, string>> = [];
  for (const c of chain) {
    if (!c) continue;
    if (c.title !== undefined) title = c.title;
    for (const m of c.meta ?? []) {
      const key = metaKey(m);
      // Keyed entries replace an ancestor's same-key entry; unkeyed append.
      if (key === undefined) {
        (meta.get(undefined) ?? meta.set(undefined, []).get(undefined)!).push(m);
      } else {
        meta.set(key, [m]);
      }
    }
    links.push(...(c.links ?? []));
  }
  return {
    title,
    meta: [...meta.values()].flat(),
    links,
  };
}
