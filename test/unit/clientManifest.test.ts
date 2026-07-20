import { describe, it, expect } from "vitest";
import { buildWebpackClientManifest } from "../../plugin/bundle/clientManifest.js";

// The webpack-shaped client manifest derives entirely from the client build's
// Vite manifest: hosted id = moduleBasePath + built file (the moduleID policy's
// own invariant — the esm transport already imports moduleBaseURL + id), and
// chunks = the module's file plus its transitive imports closure. Keys are per
// module; the transport splits the export name off the reference's $$id itself.
describe("buildWebpackClientManifest", () => {
  // Shape lifted from a real examples/router build: a client component whose
  // chunk imports a plugin chunk which imports another.
  const viteManifest = {
    "src/components/Nav.client.tsx": {
      file: "components/Nav.client-1xvucgu.js",
      imports: ["../../dist/plugin/router/link.js"],
    },
    "../../dist/plugin/router/link.js": {
      file: "dist/plugin/router/link-17ncef7.js",
      imports: ["../../dist/plugin/router/router-react.js"],
    },
    "../../dist/plugin/router/router-react.js": {
      file: "dist/plugin/router/router-react-1fzwyvj.js",
    },
    "src/styles/global.css": { file: "assets/global-abc.css" },
  };

  it("keys every JS module by its hosted path with the closure as chunks", () => {
    const m = buildWebpackClientManifest(viteManifest, "/");
    expect(m["/components/Nav.client-1xvucgu.js"]).toEqual({
      id: "/components/Nav.client-1xvucgu.js",
      chunks: [
        "/components/Nav.client-1xvucgu.js",
        "/dist/plugin/router/link-17ncef7.js",
        "/dist/plugin/router/router-react-1fzwyvj.js",
      ],
      name: "",
    });
    // Dependency modules are themselves referenceable (a "use client" module
    // can be imported directly), so they get entries too.
    expect(m["/dist/plugin/router/link-17ncef7.js"].chunks).toEqual([
      "/dist/plugin/router/link-17ncef7.js",
      "/dist/plugin/router/router-react-1fzwyvj.js",
    ]);
  });

  it("skips non-JS assets", () => {
    const m = buildWebpackClientManifest(viteManifest, "/");
    expect(Object.keys(m)).not.toContain("/assets/global-abc.css");
    expect(Object.keys(m)).toHaveLength(3);
  });

  it("applies a non-root moduleBasePath to ids and chunks alike", () => {
    const m = buildWebpackClientManifest(viteManifest, "/app/");
    const entry = m["/app/components/Nav.client-1xvucgu.js"];
    expect(entry.id).toBe("/app/components/Nav.client-1xvucgu.js");
    expect(entry.chunks[1]).toBe("/app/dist/plugin/router/link-17ncef7.js");
  });

  it("treats an empty moduleBasePath as root", () => {
    const m = buildWebpackClientManifest(viteManifest, "");
    expect(m["/components/Nav.client-1xvucgu.js"]).toBeDefined();
  });

  it("survives an import cycle", () => {
    const m = buildWebpackClientManifest(
      {
        a: { file: "a-1.js", imports: ["b"] },
        b: { file: "b-1.js", imports: ["a"] },
      },
      "/"
    );
    expect(m["/a-1.js"].chunks).toEqual(["/a-1.js", "/b-1.js"]);
    expect(m["/b-1.js"].chunks).toEqual(["/b-1.js", "/a-1.js"]);
  });

  it("ignores dangling import keys", () => {
    const m = buildWebpackClientManifest(
      { a: { file: "a-1.js", imports: ["gone"] } },
      "/"
    );
    expect(m["/a-1.js"].chunks).toEqual(["/a-1.js"]);
  });
});
