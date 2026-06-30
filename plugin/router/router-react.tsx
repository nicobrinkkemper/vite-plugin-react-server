"use client";
import React, {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { Router } from "./createRouter.js";
import { matchRoutes, type RouteParams } from "./matchRoute.js";

// Thin React bindings over the headless createRouter: a provider + hooks via
// useSyncExternalStore. Client-only ("use client") — the nav logic itself lives
// in createRouter so it stays testable without React.
type RouterContextValue = {
  router: Router<unknown>;
  location: string;
  params: Record<string, string>;
};

const RouterContext = createContext<RouterContextValue | null>(null);

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
  const state = useSyncExternalStore(
    router.subscribe,
    router.getState,
    router.getState,
  );
  const value = useMemo<RouterContextValue>(
    () => ({
      router: router as Router<unknown>,
      location: state.url,
      params: matchRoutes(patterns, state.url)?.params ?? {},
    }),
    [router, state.url, patterns],
  );
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

function useRouterContext(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error(
      "useRouter / useLocation / useParams must be used inside <RouterProvider>",
    );
  }
  return ctx;
}

export const useRouter = () => useRouterContext().router;
export const useLocation = () => useRouterContext().location;
export function useParams<P extends string = string>(): RouteParams<P> {
  return useRouterContext().params as RouteParams<P>;
}
