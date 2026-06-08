import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { handleRSCStream, type RSCStreamResponse } from "../rsc-stream.js";

/**
 * Regression guard: a server-rendered <Suspense> must round-trip through Flight
 * as a real boundary, not as a literal <suspense> host element on the client.
 *
 * This locks in the precise invariant: the Flight SERVER must serialize the
 * Suspense element type as the `$Sreact.suspense` symbol reference, NOT the
 * display-name string "Suspense". The vendored react-server-dom-esm client
 * decodes `$S<name>` via `Symbol.for(value.slice(2))`, so the symbol ref is what
 * yields a real REACT_SUSPENSE_TYPE boundary on the client; a literal "Suspense"
 * string in the model would instead render as an unknown <suspense> host element.
 */

let server: ViteDevServer;
let port = 3138;
let response: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/suspense-flight-roundtrip.test");

async function setupTestFiles() {
  await mkdir(join(testDir, "src/page"), { recursive: true });

  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import React, { Suspense } from "react";

async function Slow() {
  await new Promise((r) => setTimeout(r, 5));
  return <span id="slow-content">slow-content</span>;
}

export const Page = ({ title }: { title: string }) => (
  <div>
    <h1>{title}</h1>
    <Suspense fallback={<p id="suspense-fallback">loading-fallback</p>}>
      <Slow />
    </Suspense>
  </div>
);`
  );

  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = (url: string) => ({ title: "Suspense Roundtrip", url });`
  );

  await writeFile(
    join(testDir, "src/Root.tsx"),
    `import React from "react";
import { Css } from "vite-plugin-react-server/components";
export const Root = ({ Page, pageProps, cssFiles }: any) => (
  <>
    <Page {...pageProps} />
    <Css cssFiles={cssFiles} />
  </>
);`
  );
}

describe("Suspense Flight round-trip", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestFiles();

    const parentNodeModules = resolve(__dirname, "../../node_modules");
    const fixtureNodeModules = join(testDir, "node_modules");
    try { await symlink(parentNodeModules, fixtureNodeModules, "dir"); } catch {}

    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
          Page: "src/page/page.tsx",
          props: "src/page/props.ts",
          Root: "src/Root.tsx",
        }),
      ],
      server: { port },
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });

    await server.listen();
    port = server.config?.server?.port ?? port;
    response = await handleRSCStream(`http://localhost:${port}/index.rsc`);
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("serves the RSC stream successfully", () => {
    expect(response.ok).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it("serializes the Suspense element type as the $Sreact.suspense symbol ref", () => {
    // The correct Flight encoding for the Suspense type: a symbol row whose
    // value is "$Sreact.suspense" -> Symbol.for("react.suspense") on decode.
    expect(response.result).toContain('"$Sreact.suspense"');
  });

  it("never emits the Suspense type as a literal display-name string", () => {
    // A bare "Suspense" string row (the getComponentNameFromType display name)
    // in the model would be rendered as an unknown <suspense> host element.
    // The only legitimate "Suspense" occurrences are inside debug stack frames /
    // source paths, never as a standalone serialized model value.
    expect(response.result).not.toMatch(/(^|[\s,{:[])"Suspense"(?=[\s,}\]:])/m);
  });

  it("renders the Suspense element via a symbol-ref row, not an inline string type", () => {
    // The Suspense element should reference a symbol row (e.g. ["$","$b",...])
    // and carry the fallback — confirming it's a real boundary element, not a
    // host element named "Suspense".
    expect(response.result).toMatch(/\["\$","\$[0-9a-f]+",[^\]]*"fallback"/);
    // And it must not appear as an inline literal-string host type.
    expect(response.result).not.toMatch(/\["\$","Suspense"/);
  });
});
