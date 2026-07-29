// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createErrorBoundary } from "../../plugin/router/errorBoundary.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

async function mount(ui: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return { container, root };
}

const Boom = ({ when }: { when: boolean }): React.ReactNode => {
  if (when) throw new Error("kaboom");
  return <p data-testid="fine">fine</p>;
};

describe("createErrorBoundary", () => {
  it("renders children when nothing throws", async () => {
    const ErrorBoundary = createErrorBoundary(({ error }) => (
      <div role="alert">{error.message}</div>
    ));
    const { container } = await mount(
      <ErrorBoundary>
        <Boom when={false} />
      </ErrorBoundary>,
    );
    expect(container.querySelector("[data-testid=fine]")).not.toBeNull();
    expect(container.querySelector("[role=alert]")).toBeNull();
  });

  it("catches a child render throw and shows the fallback", async () => {
    // React logs caught boundary errors; keep the test output quiet.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const ErrorBoundary = createErrorBoundary(({ error }) => (
        <div role="alert">{error.message}</div>
      ));
      const { container } = await mount(
        <ErrorBoundary>
          <Boom when={true} />
        </ErrorBoundary>,
      );
      expect(container.querySelector("[role=alert]")?.textContent).toBe(
        "kaboom",
      );
    } finally {
      quiet.mockRestore();
    }
  });

  it("reset clears the boundary and re-renders the subtree", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let shouldThrow = true;
      const Child = (): React.ReactNode => {
        if (shouldThrow) throw new Error("first render fails");
        return <p data-testid="recovered">recovered</p>;
      };
      const ErrorBoundary = createErrorBoundary(({ error, reset }) => (
        <button onClick={reset}>{error.message}</button>
      ));
      const { container } = await mount(
        <ErrorBoundary>
          <Child />
        </ErrorBoundary>,
      );
      const button = container.querySelector("button");
      expect(button?.textContent).toBe("first render fails");

      shouldThrow = false;
      await act(async () => {
        button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.querySelector("[data-testid=recovered]")).not.toBeNull();
    } finally {
      quiet.mockRestore();
    }
  });

  it("normalizes a non-Error throw into an Error for the fallback", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const Thrower = (): React.ReactNode => {
        throw "string-throw";
      };
      const ErrorBoundary = createErrorBoundary(({ error }) => (
        <div role="alert">{error.message}</div>
      ));
      const { container } = await mount(
        <ErrorBoundary>
          <Thrower />
        </ErrorBoundary>,
      );
      expect(container.querySelector("[role=alert]")?.textContent).toBe(
        "string-throw",
      );
    } finally {
      quiet.mockRestore();
    }
  });
});
