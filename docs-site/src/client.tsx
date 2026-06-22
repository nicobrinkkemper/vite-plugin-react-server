/// <reference types="vite/client" />
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
import React, { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { createReactFetcher, hydrateOrRender } from "vite-plugin-react-server/utils";

const BASE = import.meta.env.BASE_URL || "/";

// --- Color theme toggle (system → light → dark, persisted) -----------------
const THEME_KEY = "theme";
const THEME_CYCLE = ["system", "light", "dark"];
const THEME_ICON: Record<string, string> = {
  system: "🖥️",
  light: "☀️",
  dark: "🌙",
};

/** The saved theme choice, or "system" when none/invalid. */
function readTheme(): string {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Update every toggle button's icon/label to reflect the active theme. */
function syncToggleButtons(theme: string): void {
  const label = `Theme: ${theme} — click to change`;
  document.querySelectorAll<HTMLElement>(".theme-toggle").forEach((btn) => {
    btn.textContent = THEME_ICON[theme] ?? THEME_ICON.system;
    btn.title = label;
    btn.setAttribute("aria-label", label);
  });
}

/** Set <html data-theme>, persist the choice (or clear it for "system"). */
function applyTheme(theme: string): void {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      /* storage unavailable — runtime-only */
    }
  } else {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable — runtime-only */
    }
  }
  syncToggleButtons(theme);
}

/** Should this anchor be handled as an in-site RSC navigation? */
function isInSiteLink(a: HTMLAnchorElement): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  return url.origin === location.origin && url.pathname.startsWith(BASE);
}

function App({ initialNode }: { initialNode: ReactNode }) {
  // content is always a fully-decoded node. The docs pages are synchronous
  // server components, so we never render a Suspense boundary or use() a pending
  // thenable here — vprs prerenders them with no Suspense markers to hydrate
  // against, and a client-only <Suspense> wrapper mismatches the prerender
  // (React #418). Navigation awaits the decode, then swaps the resolved node.
  const [content, setContent] = useState<ReactNode>(initialNode);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let controller: AbortController | null = null;

    // Fetch a route's RSC payload, fully decode it, then swap it in. Awaiting
    // the decode (rather than use()-ing a thenable) keeps the current page
    // visible until the next is ready, with no Suspense boundary.
    const go = (pathname: string) => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      Promise.resolve(
        createReactFetcher({ url: pathname, signal })
      )
        .then((node) => {
          if (!signal.aborted)
            startTransition(() => setContent(node as ReactNode));
        })
        .catch(() => {
          /* superseded or aborted — the replacing nav will render */
        });
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // Theme toggle: cycle system → light → dark and persist.
      if ((e.target as Element | null)?.closest?.(".theme-toggle")) {
        const next =
          THEME_CYCLE[(THEME_CYCLE.indexOf(readTheme()) + 1) % THEME_CYCLE.length];
        applyTheme(next);
        return;
      }
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
    // Nav re-renders the sidebar (and the toggle button) from the server's
    // default icon — re-sync it to the active theme. Runs on first mount too.
    syncToggleButtons(readTheme());
  }, [content]);

  return content;
}

const root = document.getElementById("root");
if (root) {
  // Resolve the initial flight payload to a ReactNode, wrap it in <App>, and
  // mount — hydrateOrRender does the #418-safe dance (fully resolve before the
  // first render, no client-only Suspense, hydrate prerendered markup in place).
  // On failure it leaves the prerendered static HTML up, so links fall back to
  // ordinary full-page navigation.
  hydrateOrRender(root, async () => (
    <App initialNode={await createReactFetcher()} />
  ));
}
