// Runnable demo of the single-isolate edge build (`build.edge.singleIsolate`).
//
// The deployable artifact is a Web `fetch` handler — exactly what Cloudflare
// Workers, Deno Deploy, Vercel Edge and Bun call. This file is the thin Node
// adapter around that handler: it serves the built client bundle (dist/client)
// and routes everything else through `createEdgeHandler`. On a real edge
// platform you would export the handler directly and drop this adapter.
//
//   1. npm run build      # emits dist/server-edge/render.js + dist/client
//   2. node edge-server.mjs
//   3. open http://localhost:8787

import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { renderRouteToFlight } from "./dist/server-edge/render.js";
import { createEdgeHandler } from "vite-plugin-react-server/stream";

const root = fileURLToPath(new URL(".", import.meta.url));
const clientDir = join(root, "dist", "client");

// Derive the hydration bootstrap entry from the client build manifest — the
// same `src/client.tsx -> <hashed>.js` mapping the SSG path reads. Served from
// the root, so the bootstrap url is `/<file>` and moduleBaseURL is `/`.
const clientManifest = JSON.parse(
  readFileSync(join(clientDir, ".vite", "manifest.json"), "utf8")
);
const clientEntry = clientManifest["src/client.tsx"]?.file;
const bootstrapModules = clientEntry ? ["/" + clientEntry] : [];

const handler = createEdgeHandler({
  render: renderRouteToFlight,
  moduleBaseURL: "/", // dist/client is served at the root below
  bootstrapModules,
});

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    // Serve a built client asset straight from dist/client if it exists.
    // normalize + prefix-check guards against path traversal.
    const assetPath = normalize(join(clientDir, url.pathname));
    if (
      url.pathname !== "/" &&
      assetPath.startsWith(clientDir) &&
      existsSync(assetPath) &&
      statSync(assetPath).isFile()
    ) {
      res.setHeader(
        "content-type",
        MIME[extname(assetPath)] ?? "application/octet-stream"
      );
      res.end(readFileSync(assetPath));
      return;
    }

    // Otherwise render through the edge fetch handler.
    const response = await handler(
      new Request(url, { method: req.method, headers: req.headers })
    );
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end(await response.text());
    }
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}).listen(8787, () => {
  console.log("edge demo running on http://localhost:8787");
});
