/**
 * Client-side navigation for the docs site.
 *
 * The pages are prerendered server components (zero client JS for the content
 * itself). This entry adds progressive enhancement: it mounts React over the
 * prerendered #root, then turns in-site link clicks into RSC navigations —
 * fetching the target route's emitted `index.rsc` payload and swapping it in a
 * transition, with no full-page reload. The server `Page` re-renders the whole
 * shell per route (including the active sidebar link), so navigation needs no
 * manual DOM bookkeeping.
 *
 * Everything degrades gracefully: with JS disabled, the same `<a href>` links
 * are ordinary full-page navigations between the prerendered HTML files.
 */
import { use, useEffect, useState, useTransition, Suspense } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createReactFetcher } from "vite-plugin-react-server/utils";

const BASE = import.meta.env.BASE_URL || "/";

type RscNode = PromiseLike<ReactNode>;

/** Should this anchor be handled as an in-site RSC navigation? */
function isInSiteLink(a: HTMLAnchorElement): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  return url.origin === location.origin && url.pathname.startsWith(BASE);
}

function App({ initial }: { initial: RscNode }) {
  const [content, setContent] = useState<RscNode>(initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let controller: AbortController | null = null;

    // Fetch a route's RSC payload and swap it in. startTransition keeps the
    // current page visible until the next one is ready (no blank flash).
    const go = (pathname: string) => {
      controller?.abort();
      controller = new AbortController();
      const next = createReactFetcher({ url: pathname, signal: controller.signal });
      startTransition(() => setContent(next));
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let the browser open new tabs etc.
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !isInSiteLink(a as HTMLAnchorElement)) return;
      const url = new URL((a as HTMLAnchorElement).href, location.href);
      // In-page hash links keep their native behavior.
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      history.pushState(null, "", url.pathname + url.hash);
      go(url.pathname);
      window.scrollTo(0, 0);
    };

    const onPopState = () => go(location.pathname);

    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      controller?.abort();
    };
  }, []);

  return use(content);
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Suspense fallback={null}>
      <App initial={createReactFetcher()} />
    </Suspense>
  );
}
