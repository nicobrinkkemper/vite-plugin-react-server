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
import { createRoot, hydrateRoot } from "react-dom/client";
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

  // Keep the document <title> in sync on client navigation. The Html wrapper
  // renders the correct per-route title at prerender (and on full loads); after
  // an in-site nav only #root is swapped, so update it here from the rendered
  // <h1>. Imperative (document.title), so nothing is hoisted into <head> — no
  // duplicate <title> on hydration.
  useEffect(() => {
    const h1 = document.querySelector("main.doc h1")?.textContent?.trim();
    if (h1) document.title = `${h1} — vite-plugin-react-server`;
  }, [content]);

  return use(content);
}

const root = document.getElementById("root");
if (root) {
  // Canonical RSC client pattern: decode the initial payload FIRST, then mount.
  // createReactFetcher reads the inlined flight payload (no network); resolving
  // it before mounting means use(initial) returns synchronously on the first
  // render, so hydrateRoot matches the prerender instead of suspending (which
  // would fail hydration and force a full client re-render). The use()/Suspense
  // shape stays for subsequent navigations, where suspending is correct.
  const initial = createReactFetcher();
  const mount = () => {
    const app = (
      <Suspense fallback={null}>
        <App initial={initial} />
      </Suspense>
    );
    if (root.hasChildNodes()) {
      hydrateRoot(root, app);
    } else {
      createRoot(root).render(app);
    }
  };
  Promise.resolve(initial).then(mount, mount);
}
