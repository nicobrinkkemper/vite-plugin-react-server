import { describe, it, expect } from "vitest";
import React from "react";
import { Writable } from "node:stream";
import { getCondition } from "../../plugin/config/getCondition.js";

// Imported from the package (dist) so the html-worker + its register-vendor
// import resolve from dist the way a real consumer's would. The loop builds the
// JS first: `npm run build:vite && npm run test:inline-renderer` (esbuild only,
// no tsc — fast). The renderer logic also has unit coverage that doesn't spawn a
// worker, but this end-to-end case is the real proof.

/**
 * createInlineFlightRenderer — fast, source-level, both-condition loop.
 *
 *  - react-server: exercises the real path (html-worker startup + dual-flight +
 *    inline injection + document structure) with a server-only page, so no built
 *    client chunks are needed. Run it with `npm run test:both -- test/streams/
 *    inline-flight-renderer.test.ts` (no build — vitest transforms the source;
 *    the html-worker resolves from the existing dist).
 *  - react-client: asserts the barrel is import-safe and fails with an actionable
 *    message (serving with inline flight is a react-server-condition activity).
 */

const INLINE_FLIGHT_ID = "vprs-flight";
const isServer = getCondition() === "react-server";

// Server-only fixtures (no "use client"), so the worker SSRs pure markup and
// needs no client-chunk resolution. Components are passed to the renderer, which
// builds the elements with its own (vendored) React.
function TestPage(props: { title?: string }) {
  return React.createElement(
    "main",
    null,
    React.createElement("h1", null, props.title ?? "untitled"),
    React.createElement("p", null, "PAGE_BODY_MARKER")
  );
}
function TestHtml({ Root, Page, pageProps, cssFiles, as }: any) {
  return React.createElement(
    "html",
    null,
    React.createElement(
      "head",
      null,
      React.createElement("title", null, pageProps?.title ?? "Test")
    ),
    React.createElement(
      "body",
      null,
      React.createElement(Root, { as, id: "root", cssFiles, Page, pageProps })
    )
  );
}

async function collectHtml(stream: { pipe: (d: Writable) => Writable }): Promise<string> {
  const chunks: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("HTML stream timed out")), 15000);
    const writable = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    writable.on("finish", () => {
      clearTimeout(timeout);
      resolve();
    });
    writable.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    stream.pipe(writable);
  });
  return chunks.join("");
}

describe("createInlineFlightRenderer", () => {
  (isServer ? it : it.skip)(
    "react-server: streams an HTML document with the matching flight inlined (flash-free)",
    async () => {
      const { createInlineFlightRenderer } = await import(
        "vite-plugin-react-server/stream"
      );

      const renderer = createInlineFlightRenderer({
        Html: TestHtml,
        clientDir: process.cwd(), // no client refs in this fixture, so unused for imports
        base: "/",
        bootstrapModules: ["/entry-test.js"],
      });

      try {
        const stream = await renderer.render({
          route: "/probe",
          Page: TestPage,
          props: { title: "Probe Title" },
        });
        const html = await collectHtml(stream);

        // Real streamed document with the page server-rendered into #root.
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("Probe Title");
        expect(html).toContain("PAGE_BODY_MARKER");
        expect(html).toContain('id="root"');

        // Bootstrap module shipped so the client hydrates.
        expect(html).toContain("/entry-test.js");

        // Inline flight present, base64, before </body>.
        const match = html.match(
          new RegExp(
            `<script type="text/x-component" id="${INLINE_FLIGHT_ID}" data-encoding="base64" data-length="(\\d+)">([^<]*)</script>`
          )
        );
        expect(match, "inline-flight <script> must be present").toBeTruthy();
        expect(html.indexOf(`id="${INLINE_FLIGHT_ID}"`)).toBeLessThan(
          html.lastIndexOf("</body>")
        );

        // The stamped length must match the payload exactly — it is what lets the
        // browser tell a whole element from one the parser is still writing into.
        expect(Number(match![1])).toBe(match![2].length);

        // The inlined payload decodes to non-empty flight bytes.
        const decoded = Buffer.from(match![2], "base64");
        expect(decoded.length).toBeGreaterThan(0);
      } finally {
        await renderer.close();
      }
    }
  );

  (!isServer ? it : it.skip)(
    "react-client: import-safe, factory throws an actionable error",
    async () => {
      const { createInlineFlightRenderer } = await import(
        "vite-plugin-react-server/stream"
      );
      expect(() =>
        createInlineFlightRenderer({ Html: (() => null) as any, clientDir: "x" })
      ).toThrow(/react-server/);
    }
  );
});
