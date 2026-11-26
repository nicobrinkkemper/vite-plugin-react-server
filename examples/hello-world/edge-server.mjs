// Runnable demo of the single-isolate edge build (`build.edge`, on by default).
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

import {
  renderRouteToDocument,
  clientModuleBaseURL,
  bootstrapModules,
} from "./dist/server-edge/render.js";
import { createEdgeHandler } from "vite-plugin-react-server/stream";

const root = fileURLToPath(new URL(".", import.meta.url));
const clientDir = join(root, "dist", "client");

// The bake exports both values the handler needs to find the client build:
//
// - `clientModuleBaseURL` is dist/client as a file url. The render runs in this
//   process and loads each "use client" component by importing its built chunk,
//   so the base has to be a location on disk. The browser's http base ("/")
//   only works for a page without client components.
// - `bootstrapModules` is the hashed client entry the browser loads to hydrate,
//   served from the root below.
//
// `renderRouteToDocument` is the full document from the Html component
// (html/head/body and its charset). It does not copy index.html's <title>.
// `renderRouteToFlight` is only the inner markup.
// Pass the function itself. createEdgeHandler calls it with
// `{ request, platform }`, and a wrapper that only forwards the url drops
// the cookies, headers, and host bindings a per-request props/loader reads.
const handler = createEdgeHandler({
  renderDocument: renderRouteToDocument,
  moduleBaseURL: clientModuleBaseURL,
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

const port = Number(process.env.PORT ?? 8787);

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
}).listen(port, () => {
  console.log(`edge demo running on http://localhost:${port}`);
});
