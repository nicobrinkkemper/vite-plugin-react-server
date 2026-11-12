import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClientBuildManifestLookup } from "../../plugin/config/clientBuildManifest.js";
import {
  browserFilesOfId,
  keepClientReferences,
  recordClientReference,
  takeClientReferences,
  validateClientReferences,
  type ClientReference,
  type ClientReferencePolicy,
} from "../../plugin/bundle/validateClientReferences.js";

describe("validateClientReferences", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "vprs-validate-refs-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, body = "") {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }

  function writeManifest(entries: Record<string, string>, path = "dist/static/.vite/manifest.json") {
    write(
      path,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(entries).map(([src, file]) => [src, { file, src }])
        )
      )
    );
    return join(root, path);
  }

  function validate(
    references: ClientReference[],
    {
      manifestPath = join(root, "dist/static/.vite/manifest.json"),
      moduleBasePath = "/",
      policy,
    }: { manifestPath?: string; moduleBasePath?: string; policy?: ClientReferencePolicy } = {}
  ) {
    validateClientReferences({
      references,
      projectRoot: root,
      browserOutDir: join(root, "dist/static"),
      moduleBasePath,
      manifest: createClientBuildManifestLookup({
        projectRoot: root,
        outDir: "dist",
        staticDir: "static",
        getPath: () => manifestPath,
      }),
      policy,
    });
  }

  const source = () => join(root, "src/Button.client.tsx");

  it("passes a reference whose file the browser build wrote", () => {
    writeManifest({ "src/Button.client.tsx": "assets/Button.client-abc123.js" });
    write("dist/static/assets/Button.client-abc123.js");
    expect(() =>
      validate([{ source: source(), id: "/assets/Button.client-abc123.js" }])
    ).not.toThrow();
  });

  it("passes with a manifest at a custom path", () => {
    const manifestPath = writeManifest(
      { "src/Button.client.tsx": "assets/Button.client-abc123.js" },
      "dist/static/metadata/browser.json"
    );
    write("dist/static/assets/Button.client-abc123.js");
    expect(() =>
      validate([{ source: source(), id: "/assets/Button.client-abc123.js" }], { manifestPath })
    ).not.toThrow();
  });

  it("passes an unhashed id whose file exists, manifest or not", () => {
    write("dist/static/Button.client.js");
    expect(() =>
      validate([{ source: source(), id: "/Button.client.js" }])
    ).not.toThrow();
  });

  it("passes an id under a moduleBasePath, served with or without the prefix as a directory", () => {
    write("dist/static/assets/Button.client-abc123.js");
    write("dist/static/app/assets/Card.client-def456.js");
    expect(() =>
      validate(
        [
          { source: source(), id: "/app/assets/Button.client-abc123.js" },
          { source: join(root, "src/Card.client.tsx"), id: "/app/assets/Card.client-def456.js" },
        ],
        { moduleBasePath: "/app/" }
      )
    ).not.toThrow();
  });

  it("never checks an id that is a URL", () => {
    expect(browserFilesOfId("https://cdn.example.com/Button.js", "/")).toBeUndefined();
    expect(browserFilesOfId("//cdn.example.com/Button.js", "/")).toBeUndefined();
    expect(() =>
      validate([
        { source: source(), id: "https://cdn.example.com/Button.js" },
        { source: join(root, "src/Card.client.tsx"), id: "//cdn.example.com/Card.js" },
      ])
    ).not.toThrow();
  });

  it("exempts the references the policy function returns false for", () => {
    const references = [
      { source: source(), id: "/remote/Button.js" },
      { source: join(root, "src/Card.client.tsx"), id: "/Card.client.js" },
    ];
    expect(() =>
      validate(references, { policy: ({ id }) => !id.startsWith("/remote/") })
    ).toThrow(/src\/Card\.client\.tsx is referenced as \/Card\.client\.js/);
    expect(() =>
      validate(references, { policy: ({ id }) => !id.startsWith("/remote/") })
    ).not.toThrow(/Button/);
    expect(() => validate(references, { policy: () => false })).not.toThrow();
    expect(() => validate(references, { policy: false })).not.toThrow();
  });

  it("names the source, the id and the manifest when the manifest has no entry", () => {
    writeManifest({});
    expect(() =>
      validate([{ source: source(), id: "/Button.client.js" }])
    ).toThrow(
      "src/Button.client.tsx is referenced as /Button.client.js, but " +
        "dist/static/Button.client.js does not exist: " +
        "dist/static/.vite/manifest.json has no entry for it."
    );
  });

  it("names the missing file when the manifest lists it but it is not on disk", () => {
    writeManifest({ "src/Button.client.tsx": "assets/Button.client-abc123.js" });
    expect(() =>
      validate([{ source: source(), id: "/assets/Button.client-abc123.js" }])
    ).toThrow(
      "dist/static/assets/Button.client-abc123.js does not exist: " +
        "dist/static/.vite/manifest.json lists that file, but it is not on disk."
    );
  });

  it("names both files when the reference and the manifest disagree", () => {
    writeManifest({ "src/Button.client.tsx": "assets/Button.client-abc123.js" });
    write("dist/static/assets/Button.client-abc123.js");
    expect(() =>
      validate([{ source: source(), id: "/assets/Button.client-old000.js" }])
    ).toThrow(
      "dist/static/.vite/manifest.json maps it to assets/Button.client-abc123.js instead."
    );
  });

  it("reports every missing reference at once", () => {
    writeManifest({});
    expect(() =>
      validate([
        { source: source(), id: "/Button.client.js" },
        { source: join(root, "src/Card.client.tsx"), id: "/Card.client.js" },
      ])
    ).toThrow(/2 client references have no file[\s\S]*Button\.client\.tsx[\s\S]*Card\.client\.tsx/);
  });

  it("hands each recorded reference out once", () => {
    takeClientReferences();
    recordClientReference("/a.tsx", { source: "/a.tsx", id: "/a.js" });
    recordClientReference("/a.tsx", { source: "/a.tsx", id: "/a.js" });
    recordClientReference("/b.tsx", { source: "/b.tsx", id: "/b.js" });
    expect(takeClientReferences()).toEqual([
      { source: "/a.tsx", id: "/a.js" },
      { source: "/b.tsx", id: "/b.js" },
    ]);
    expect(takeClientReferences()).toEqual([]);
  });

  it("keeps only the references the server can send", () => {
    takeClientReferences();
    recordClientReference("/imported.tsx", { source: "/imported.tsx", id: "/imported.js" });
    recordClientReference("/entry-only.tsx", { source: "/entry-only.tsx", id: "/entry-only.js" });
    keepClientReferences((moduleId) => moduleId === "/imported.tsx");
    expect(takeClientReferences()).toEqual([
      { source: "/imported.tsx", id: "/imported.js" },
    ]);
  });
});
