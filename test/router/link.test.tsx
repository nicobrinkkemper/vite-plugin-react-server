// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouter } from "../../plugin/router/createRouter.js";
import { Link } from "../../plugin/router/link.js";
import { RouterProvider } from "../../plugin/router/router-react.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  history.replaceState(null, "", "/");
});

async function mount(ui: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return container.querySelector("a") as HTMLAnchorElement;
}

function withRouter(node: React.ReactNode) {
  const router = createRouter({ fetchFlight: async (u: string) => u });
  return { router, ui: <RouterProvider router={router}>{node}</RouterProvider> };
}

describe("Link", () => {
  it("intercepts a plain internal click and navigates", async () => {
    const { router, ui } = withRouter(<Link to="/about">about</Link>);
    const navigate = vi.spyOn(router, "navigate");
    const a = await mount(ui);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      a.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(navigate.mock.calls[0]?.[0]).toBe("/about");
  });

  it("lets modified clicks through to the browser", async () => {
    const { router, ui } = withRouter(<Link to="/about">about</Link>);
    const navigate = vi.spyOn(router, "navigate");
    const a = await mount(ui);
    const ev = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    await act(async () => {
      a.dispatchEvent(ev);
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not intercept external links", async () => {
    const { router, ui } = withRouter(<Link to="https://example.com">x</Link>);
    const navigate = vi.spyOn(router, "navigate");
    const a = await mount(ui);
    await act(async () => {
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("warms the flight on hover when prefetch='hover'", async () => {
    const { router, ui } = withRouter(
      <Link to="/p" prefetch="hover">
        p
      </Link>,
    );
    const prefetch = vi.spyOn(router, "prefetch");
    const a = await mount(ui);
    await act(async () => {
      a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(prefetch).toHaveBeenCalledWith("/p");
  });

  it("does not prefetch when prefetch={false}", async () => {
    const { router, ui } = withRouter(
      <Link to="/p" prefetch={false}>
        p
      </Link>,
    );
    const prefetch = vi.spyOn(router, "prefetch");
    const a = await mount(ui);
    await act(async () => {
      a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("renders a plain anchor (no interception) outside a RouterProvider", async () => {
    // During static prerender there's no provider yet — Link must still render
    // and must NOT intercept (the browser handles the navigation).
    const a = await mount(<Link to="/x">x</Link>);
    expect(a.getAttribute("href")).toBe("/x");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      a.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
  });
});
