import { describe, it, expect, vi } from "vitest";
import { createActionOutcomeHooks } from "../../plugin/router/actionOutcomeHooks.js";
import { createRouter, type Router } from "../../plugin/router/createRouter.js";

// The action-outcome contract, pinned against a real router over a stubbed
// fetch. The load-bearing case: a mutation's reach is unknowable client-side,
// so a successful action must drop EVERY cached flight — invalidating only
// the current route leaves other visited routes (the list a delete came
// from) serving pre-mutation views on nav-back until LRU eviction.

function makeRouter(fetchFlight: (url: string) => Promise<string>): Router<string> {
  return createRouter<string>({ fetchFlight });
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createActionOutcomeHooks", () => {
  it("onSuccess drops every cached route, not just the current one", async () => {
    const fetches: string[] = [];
    const router = makeRouter(async (url) => {
      fetches.push(url);
      return `flight:${url}@${fetches.length}`;
    });
    const delivered: string[] = [];
    const hooks = createActionOutcomeHooks({
      router: () => router,
      deliver: (node) => delivered.push(node),
      stripBasePath: (p) => p,
    });

    // Visit /list/ then /item/ so both flights are cached.
    await router.flight("/list/");
    router.navigate("/item/");
    await router.flight("/item/");
    fetches.length = 0;

    hooks.onSuccess();
    await flush();

    // The current route refetched and was delivered.
    expect(fetches).toContain("/item/");
    expect(delivered).toHaveLength(1);

    // The OTHER route must refetch too — a cached hit would keep the
    // pre-mutation view.
    await router.flight("/list/");
    expect(fetches).toContain("/list/");
  });

  it("onSuccess does not deliver a view for a route the user already left", async () => {
    const router = makeRouter(async (url) => `flight:${url}`);
    const delivered: string[] = [];
    const hooks = createActionOutcomeHooks({
      router: () => router,
      deliver: (node) => delivered.push(node),
      stripBasePath: (p) => p,
    });

    hooks.onSuccess();
    router.navigate("/elsewhere/");
    await flush();

    expect(delivered).toHaveLength(0);
  });

  it("onSuccess leaves the view alone when the refresh fetch fails", async () => {
    let fail = false;
    const router = makeRouter(async (url) => {
      if (fail) throw new Error("offline");
      return `flight:${url}`;
    });
    const delivered: string[] = [];
    const hooks = createActionOutcomeHooks({
      router: () => router,
      deliver: (node) => delivered.push(node),
      stripBasePath: (p) => p,
    });

    fail = true;
    hooks.onSuccess();
    await flush();
    expect(delivered).toHaveLength(0);
  });

  it("onRedirect strips the base, primes the target, and navigates", () => {
    const router = makeRouter(async (url) => `flight:${url}`);
    const prime = vi.spyOn(router, "prime");
    const hooks = createActionOutcomeHooks({
      router: () => router,
      deliver: () => {},
      stripBasePath: (p) => p.replace(/^\/app/, ""),
    });

    hooks.onRedirect("/app/next/", "primed-page");

    expect(prime).toHaveBeenCalledWith("/next/", "primed-page");
    expect(router.getState().url).toBe("/next/");
  });

  it("onNotFound delivers the 404 route's flight and swallows a failed fetch", async () => {
    const router = makeRouter(async (url) => `flight:${url}`);
    const delivered: string[] = [];
    const hooks = createActionOutcomeHooks({
      router: () => router,
      deliver: (node) => delivered.push(node),
      stripBasePath: (p) => p,
    });

    hooks.onNotFound();
    await flush();
    expect(delivered).toEqual(["flight:/404/"]);

    const failing = makeRouter(async () => {
      throw new Error("no 404 flight");
    });
    const hooks2 = createActionOutcomeHooks({
      router: () => failing,
      deliver: (node) => delivered.push(node),
      stripBasePath: (p) => p,
    });
    hooks2.onNotFound();
    await flush();
    expect(delivered).toHaveLength(1);
  });
});
