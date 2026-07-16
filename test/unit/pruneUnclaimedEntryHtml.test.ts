import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pruneUnclaimedEntryHtml } from "../../plugin/react-static/pruneUnclaimedEntryHtml.js";
import { routeToOutputDir } from "../../plugin/react-static/fileWriter.js";

const exists = async (p: string) =>
  await access(p).then(
    () => true,
    () => false
  );

describe("react-static/routeToOutputDir", () => {
  // fileWriter and the prune step MUST agree on which route owns
  // <staticDir>/index.html — if these drift, the prune deletes a real page.
  it("maps / to the static root and /about to about/", () => {
    expect(routeToOutputDir("/")).toBe("");
    expect(routeToOutputDir("/about")).toBe("about");
    expect(routeToOutputDir("/blog/post")).toBe("blog/post");
  });
});

describe("react-static/pruneUnclaimedEntryHtml", () => {
  let dir: string;
  let build: { outDir: string; static: string; htmlOutputPath: string };
  let entryHtml: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vprs-prune-"));
    build = { outDir: dir, static: "static", htmlOutputPath: "index.html" };
    entryHtml = resolve(dir, "static", "index.html");
    await mkdir(resolve(dir, "static"), { recursive: true });
    await writeFile(entryHtml, '<div id="root"></div>');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("REGRESSION: removes the entry template when build.pages does not claim /", async () => {
    // The router-era bug: pages excludes "/", but Vite's index.html input is
    // emitted anyway and shadows the per-request route on the host.
    const removed = await pruneUnclaimedEntryHtml({
      build,
      pages: ["/about"],
    });

    expect(removed).toBe(entryHtml);
    expect(await exists(entryHtml)).toBe(false);
  });

  it("keeps index.html when a page claims / (it is the prerendered page)", async () => {
    const removed = await pruneUnclaimedEntryHtml({
      build,
      pages: ["/", "/about"],
    });

    expect(removed).toBeNull();
    expect(await exists(entryHtml)).toBe(true);
  });

  it("keeps index.html when there are no pages at all (SPA shell)", async () => {
    // build.pages isn't claiming anything either way, so the template is the
    // deliverable — a client-only build must not lose its entry.
    const removed = await pruneUnclaimedEntryHtml({ build, pages: [] });

    expect(removed).toBeNull();
    expect(await exists(entryHtml)).toBe(true);
  });

  it("honors a custom htmlOutputPath", async () => {
    const custom = resolve(dir, "static", "app.html");
    await writeFile(custom, "<html></html>");

    const removed = await pruneUnclaimedEntryHtml({
      build: { ...build, htmlOutputPath: "app.html" },
      pages: ["/about"],
    });

    expect(removed).toBe(custom);
    expect(await exists(custom)).toBe(false);
  });

  it("is idempotent — an already-absent entry is the desired state, not an error", async () => {
    await rm(entryHtml);
    await expect(
      pruneUnclaimedEntryHtml({ build, pages: ["/about"] })
    ).resolves.toBeNull();
  });
});
