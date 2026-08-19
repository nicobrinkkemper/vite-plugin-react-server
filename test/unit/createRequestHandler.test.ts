import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequestHandler } from "../../dist/plugin/helpers/createRequestHandler.server.js";

let staticDir: string;
let handler: (request: Request) => Promise<Response>;

beforeAll(async () => {
  staticDir = await mkdtemp(join(tmpdir(), "vprs-req-"));
  await writeFile(join(staticDir, "index.html"), "<!doctype html><title>home</title>");
  await mkdir(join(staticDir, "about"), { recursive: true });
  await writeFile(join(staticDir, "about", "index.html"), "<h1>about</h1>");
  await writeFile(join(staticDir, "index.rsc"), "0:flight");

  handler = createRequestHandler({
    staticDir,
    action: {
      projectRoot: process.cwd(),
      devOpen: true,
      ssrLoadModule: async () => ({ go: async (x: string) => ({ got: x }) }),
    },
    render: (route) =>
      route === "/dynamic"
        ? new Response("<h1>dyn</h1>", { headers: { "Content-Type": "text/html" } })
        : null,
  });
});

afterAll(() => rm(staticDir, { recursive: true, force: true }));

const get = (path: string) => handler(new Request(`https://example.test${path}`));

describe("createRequestHandler", () => {
  it("serves index.html for /", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("home");
  });

  it("serves a nested route's index.html for an extensionless path", async () => {
    const res = await get("/about");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("about");
  });

  it("serves .rsc payloads as text/x-component", async () => {
    const res = await get("/index.rsc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
  });

  it("uses the render hook for dynamic routes", async () => {
    const res = await get("/dynamic");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("dyn");
  });

  it("falls through to the static file when render returns null", async () => {
    const res = await get("/");
    expect(await res.text()).toContain("home");
  });

  it("404s an unknown path", async () => {
    expect((await get("/nope")).status).toBe(404);
  });

  it("blocks path traversal out of the static dir", async () => {
    const res = await handler(
      new Request("https://example.test/..%2f..%2f..%2fetc%2fpasswd")
    );
    expect(res.status).toBe(404);
  });

  it("dispatches a server-action POST to the action handler", async () => {
    const res = await handler(
      new Request("https://example.test/src/a.ts#go", {
        method: "POST",
        headers: { "x-rsc-action": "src/a.ts#go" },
        body: JSON.stringify(["hi"]),
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    // Under the react-server condition the codec flight-renders the
    // { returnValue } envelope (a pure-JSON model is a single row).
    const body = await res.text();
    // the dev flight build may prepend debug rows (e.g. ":N<ts>");
    // match the model row anywhere in the payload.
    const row = body.match(/^0:(.*)$/m);
    expect(row, `flight body: ${body}`).toBeTruthy();
    expect(JSON.parse(row![1]!)).toEqual({ returnValue: { got: "hi" } });
  });
});
