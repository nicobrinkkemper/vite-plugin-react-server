"use client";
// Namespace import (not named hooks) so this module is import-safe when the
// react-server build traverses the ./client barrel — the react-server React
// build omits client-only APIs like createContext, and a named import binds
// eagerly (breaks); React.createContext defers the access. See
// vprs_react_server_barrel_import_safety.
import * as React from "react";
import type { ReactNode } from "react";
import type { Router } from "./createRouter.js";
import { matchRoutes, type RouteParams } from "./matchRoute.js";

// Thin React bindings over the headless createRouter: a provider + hooks via
// useSyncExternalStore. Client-only ("use client") — the nav logic itself lives
// in createRouter so it stays testable without React.
type RouterContextValue = {
  router: Router<unknown>;
  location: string;
  params: Record<string, string>;
  navigation: NavigationState;
};

/**
 * The navigation-pending window: the router swaps resolve-then-set, so between
 * a navigation and its content committing, the OLD view is still on screen.
 * While that window is open `pending` is true and `to` names the target;
 * otherwise `to` is null.
 */
export type NavigationState = { pending: boolean; to: string | null };

const RouterContext = React.createContext<RouterContextValue | null>(null);

export function RouterProvider<T>({
  router,
  patterns = [],
  children,
}: {
  router: Router<T>;
  /** Route patterns, so useParams() can resolve params for the current url. */
  patterns?: readonly string[];
  children: ReactNode;
}) {
  const state = React.useSyncExternalStore(
    router.subscribe,
    router.getState,
    router.getState,
  );
  const pending = state.url !== state.shownUrl;
  const value = React.useMemo<RouterContextValue>(
    () => ({
      router: router as Router<unknown>,
      location: state.url,
      params: matchRoutes(patterns, state.url)?.params ?? {},
      navigation: { pending, to: pending ? state.url : null },
    }),
    [router, state.url, pending, patterns],
  );
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

function useRouterContext(): RouterContextValue {
  const ctx = React.useContext(RouterContext);
  if (!ctx) {
    throw new Error(
      "useRouter / useLocation / useParams must be used inside <RouterProvider>",
    );
  }
  return ctx;
}

export const useRouter = () => useRouterContext().router;

/**
 * The router if inside a <RouterProvider>, else null — non-throwing, for
 * components that must also render outside a provider (e.g. Link during static
 * prerender, before startClient mounts the provider on the client).
 */
export function useOptionalRouter(): Router<unknown> | null {
  return React.useContext(RouterContext)?.router ?? null;
}
export const useLocation = () => useRouterContext().location;
export function useParams<P extends string = string>(): RouteParams<P> {
  return useRouterContext().params as RouteParams<P>;
}
export const useNavigation = (): NavigationState =>
  useRouterContext().navigation;

/** Non-throwing useNavigation, for components (Link) that also render outside
 *  a provider. */
export function useOptionalNavigation(): NavigationState | null {
  return React.useContext(RouterContext)?.navigation ?? null;
}
