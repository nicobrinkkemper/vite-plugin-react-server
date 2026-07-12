import { test, expect } from "@playwright/test";

/**
 * Dev-server hydration smoke.
 *
 * The supplied client entry (`startClient` -> `hydrateOrRender`) lazily
 * `import("react-dom/client")` to stay load-safe under the react-server
 * condition. Vite's dev server serves that module as raw CJS, so a dynamic
 * import can land createRoot/hydrateRoot on `.default` instead of the namespace
 * top level; a regression there threw "createRoot is not a function" and left
 * the page as UN-hydrated static HTML. That failure is invisible to a naive
 * "#root has children" assertion, because hydrateOrRender's onError keeps the
 * prerendered markup in place. Preview/build never reproduce it (react-dom/client
 * is bundled with the exports at the top level) and jsdom resolves the module
 * the Node way, so only a real browser against a real dev server catches it.
 *
 * This spec therefore asserts BOTH that the mount error is absent AND that the
 * page is genuinely interactive: a client-side navigation preserves a window
 * marker that a full-page reload would wipe. The e2e fixture runs dev:rsc; the
 * browser client path is identical under dev:ssr.
 */
test.describe("dev-server hydration", () => {
  test("mounts with no react-dom/client interop error", async ({ page }) => {
    const mountErrors: string[] = [];
    const watch = (text: string) => {
      if (
        /createRoot is not a function|hydrateOrRender: initial payload failed|did not expose createRoot/i.test(
          text,
        )
      ) {
        mountErrors.push(text);
      }
    };
    page.on("console", (m) => watch(m.text()));
    page.on("pageerror", (e) => watch(e.message));

    await page.goto("/");
    await expect(page.locator("#root")).not.toBeEmpty();
    // Give hydrateOrRender's Promise.all (flight decode + react-dom import) time
    // to resolve and either mount or fall back to onError.
    await page.waitForTimeout(1000);

    expect(
      mountErrors,
      `client mount logged react-dom/client errors:\n${mountErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("is interactive after hydration (client nav keeps a reload-wiping marker)", async ({
    page,
  }) => {
    await page.goto("/");

    // A full-page reload wipes this; a hydrated client-side navigation keeps it.
    // If hydration failed, the server-rendered <a> carries no React handler and
    // the click does a native full navigation, dropping the marker.
    await page.evaluate(() => {
      (window as Window & { __hydrated?: string }).__hydrated = "yes";
    });

    const link = page.locator('a[href*="todos"]').first();
    await expect(link).toBeVisible(); // fail loudly if the fixture changes, never a silent skip
    await link.click();
    await page.waitForURL(/\/todos/);

    const survived = await page.evaluate(
      () => (window as Window & { __hydrated?: string }).__hydrated,
    );
    expect(survived).toBe("yes");
  });
});
