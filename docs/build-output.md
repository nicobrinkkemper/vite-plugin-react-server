# Build Output

Running `NODE_OPTIONS='--conditions react-server' vite build --app` produces three directories:

```
dist/
├── static/                    # Complete static site
│   ├── index.html             # Pre-rendered HTML
│   ├── index.rsc              # RSC payload (for client-side navigation)
│   ├── about/
│   │   ├── index.html
│   │   └── index.rsc
│   ├── assets/                # Hashed JS/CSS bundles
│   └── .vite/manifest.json
├── client/                    # Client boundary ESM modules
│   ├── page/
│   │   └── page.js
│   └── components/
│       └── Counter.client-CnBCzH8H.js
└── server/                    # Server boundary ESM modules
    ├── page/
    │   ├── page.js
    │   ├── props.js
    │   └── actions.server.js  # Transformed with registerServerReference
    └── components/
        └── Counter.client-CnBCzH8H.js  # Replaced with registerClientReference
```

## What Each Directory Is For

### `dist/static/` — deploy this

A self-contained static site. Every route in `build.pages` gets an `index.html` and `index.rsc`. Deploy to GitHub Pages, Netlify, S3, or any static host.

### `dist/client/` — SSR client boundary

ESM modules with bare specifier imports, meant for Node.js SSR. These are the client components your server needs to render HTML.

### `dist/server/` — server boundary

ESM modules with server actions transformed to use `registerServerReference`. Import these in your Express/Hono server to handle server action requests.

## Consistent Hashing

The same source file gets the same content hash across all three builds:

```
dist/client/components/Link.client-CnBCzH8H.js
dist/server/components/Link.client-CnBCzH8H.js
dist/static/components/Link.client-CnBCzH8H.js
```

This ensures module references are consistent between client and server.

## Using the ESM Modules in a Server

The build output is designed to be consumed by any Node.js HTTP server. Here's an Express example:

```ts
// server.ts
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files (pre-rendered HTML + assets)
app.use(express.static(join(__dirname, "dist/static")));

// Handle RSC requests
app.get("*.rsc", (req, res) => {
  res.setHeader("Content-Type", "text/x-component");
  res.sendFile(join(__dirname, "dist/static", req.path));
});

// Handle server actions (POST requests to module paths)
app.post("/src/*", async (req, res) => {
  const modulePath = join(__dirname, "dist/server", req.path);
  const mod = await import(modulePath);
  const [, exportName] = req.url.split("#");
  const result = await mod[exportName](...req.body);
  // Stream RSC response back
  res.setHeader("Content-Type", "text/x-component");
  // ... stream the result
});

app.listen(3000);
```

For a real-world example, see the [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official) demo.

## Stream Types

### Headless RSC Stream (`index.rsc`)

Used for client-side page navigation. Contains serialized React components and CSS metadata. Smaller than full HTML — only updates what changed.

### Full HTML Stream (`index.html`)

Complete HTML document with `<html>`, `<head>`, `<body>`. Used for initial page load and static hosting.

Both streams include detailed stack traces in development mode.

## Build Modes

### Single-step (recommended)

```bash
NODE_OPTIONS='--conditions react-server' vite build --app
```

Builds all three environments in sequence automatically.

### Multi-step (for debugging)

```bash
vite build                                                    # static
vite build --ssr                                              # client
NODE_OPTIONS='--conditions react-server' vite build --ssr     # server
```

### Parallel Rendering

For sites with many pages:

```ts
build: {
  pages: ["/", "/about", ...hundredsOfPages],
  renderMode: "parallel",  // default
  batchSize: 8,            // pages per batch
}
```

Use `renderMode: "sequential"` for debugging or low-memory environments.

## Environment Variables

The plugin sets these automatically if not provided:

- `VITE_MODE` — build mode
- `VITE_DEV` / `VITE_PROD` — boolean flags
- `VITE_SSR` — true during SSR builds
- `VITE_PUBLIC_ORIGIN` — base URL for assets
- `VITE_BASE_URL` — application base URL

Access them in server components via `process.env`.
