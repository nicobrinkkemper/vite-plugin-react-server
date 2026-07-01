"use client";
// Namespace import for react-server barrel import-safety (see router-react.tsx).
import * as React from "react";
import type {
  AnchorHTMLAttributes,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { ToPath } from "./register.js";
import { useOptionalRouter } from "./router-react.js";

// Client-side <Link> over the nav primitive: intercepts plain internal clicks
// to navigate without a reload, and warms the target's flight on hover/focus so
// the click is instant. Modified clicks, target=_blank, and external/protocol
// hrefs fall through to the browser. A plain <a> stays the 0-JS default for
// static sites; this island only ships where used.
export type LinkPrefetch = "intent" | "hover" | false;

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Registered routes autocomplete; any string is still accepted. */
  to: ToPath;
  replace?: boolean;
  /** "intent" (default): warm after a short hover/on focus; "hover": warm
   *  immediately; false: never. */
  prefetch?: LinkPrefetch;
};

const INTENT_MS = 60;

const isModified = (e: ReactMouseEvent) =>
  e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

// Anything with a scheme (http:, mailto:, tel:) or protocol-relative // is external.
const isExternal = (to: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(to) || to.startsWith("//");

export function Link({
  to,
  replace,
  prefetch = "intent",
  target,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  children,
  ...rest
}: LinkProps) {
  // Optional: Link also renders during static prerender (no provider yet) and
  // as a plain <a> outside a router — it just doesn't intercept there.
  const router = useOptionalRouter();
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const canIntercept =
    router !== null && !isExternal(to) && (!target || target === "_self");
  const warm = () => router?.prefetch(to);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  };

  return (
    <a
      href={to}
      target={target}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !canIntercept || isModified(e)) return;
        e.preventDefault();
        cancel();
        router?.navigate(to, { replace });
      }}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        if (!canIntercept || prefetch === false) return;
        if (prefetch === "hover") warm();
        else {
          cancel();
          timer.current = setTimeout(warm, INTENT_MS);
        }
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.(e);
        cancel();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        if (canIntercept && prefetch !== false) warm();
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
