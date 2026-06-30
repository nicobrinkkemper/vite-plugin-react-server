// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createRouter } from "../../plugin/router/createRouter.js";
import {
  RouterProvider,
  useLocation,
  useParams,
} from "../../plugin/router/router-react.js";

// Required for React's act() outside a testing-library harness.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  history.replaceState(null, "", "/");
});

function Probe() {
  const loc = useLocation();
  const { id } = useParams<"/profile/$id">();
  return (
    <div>
      {loc}|{id ?? "none"}
    </div>
  );
}

describe("RouterProvider + hooks", () => {
  it("exposes location + params and re-renders on navigate", async () => {
    const router = createRouter({ fetchFlight: async (u: string) => u });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RouterProvider router={router} patterns={["/profile/$id"]}>
          <Probe />
        </RouterProvider>,
      );
    });
    expect(container.textContent).toBe("/|none");

    await act(async () => {
      router.navigate("/profile/42");
    });
    expect(container.textContent).toBe("/profile/42|42");

    await act(async () => {
      root.unmount();
    });
  });
});
