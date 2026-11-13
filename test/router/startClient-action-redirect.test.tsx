// @vitest-environment happy-dom
import React, { act } from "react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real startClient and its RouteView over a stubbed transport: the
// fetcher answers each url with a page built from `todos`, and hands the test
// the action-outcome hooks startClient wired into it.
type OutcomeHooks = {
  onRedirect: (route: string, page: unknown) => void;
};
const transport = vi.hoisted(() => ({
  todos: [] as string[],
  fetches: [] as string[],
  hooks: null as OutcomeHooks | null,
}));

const todosPage = (todos: readonly string[]): ReactNode => (
  <ul>
    {todos.map((todo) => (
      <li key={todo}>{todo}</li>
    ))}
  </ul>
);

vi.mock("../../plugin/utils/index.client.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../plugin/utils/index.client.js")
    >();
  return {
    ...actual,
    createReactFetcher: (opts: { url: string; callServerHooks: OutcomeHooks }) => {
      transport.hooks = opts.callServerHooks;
      transport.fetches.push(opts.url);
      return Promise.resolve(todosPage(transport.todos));
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const settle = () =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  });

beforeEach(() => {
  history.replaceState(null, "", "/todos/");
  document.body.innerHTML = '<div id="root"></div>';
  transport.todos = ["milk"];
  transport.fetches = [];
  transport.hooks = null;
});

describe("startClient: an action redirecting to the current route", () => {
  it("shows the page the redirect returned", async () => {
    const { startClient } = await import(
      "../../plugin/router/startClient.js"
    );
    const router = startClient();
    await settle();
    const root = document.getElementById("root")!;
    expect(root.textContent).toBe("milk");
    const historyLength = history.length;

    // The action adds a todo and redirects to /todos/, the route on screen;
    // the followed redirect carries the post-mutation page.
    transport.todos = ["milk", "eggs"];
    transport.fetches = [];
    await act(async () => {
      transport.hooks!.onRedirect("/todos/", todosPage(transport.todos));
    });
    await settle();

    expect(root.textContent).toBe("milkeggs");
    expect(router.getState()).toEqual({ url: "/todos/", shownUrl: "/todos/" });
    // The returned page is the view: no second fetch, no extra history entry.
    expect(transport.fetches).toEqual([]);
    expect(history.length).toBe(historyLength);
  });
});
