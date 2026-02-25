# Vite React Server Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static HTML page generation. This plugin uses **React conditions** to automatically provide the optimal implementation for each execution environment.

**React Components as part of your build tooling** - not just as a dependency.

### Vite's Philosophy + React

[Vite's philosophy](https://vite.dev/guide/philosophy.html) is built around Native ESM and making frameworks first-class citizens. This plugin extends that philosophy to React Server Components:

- **Native ESM for React**: Your React components are true ESM modules that work anywhere
- **React as Configuration**: Serialize React Server Components for static hosting
- **On-Demand Loading**: Only streams the pages you're actually developing
- **React condition**: Automatically adapts to client/server environments

## Quick Start

```sh
npm install -D vite-plugin-react-server react@experimental react-dom@experimental
```

**Minimal Config:**

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
    plugins: vitePluginReactServer({
      moduleBase: "src",
      Page: `src/page.tsx`,
      build: { pages: ["/"] }
    }),
});
```

**Create a Page:**

```tsx
// src/page.tsx
export const Page = ({ url }: { url: string }) => {
  return <div>Hello from {url}</div>;
};
```

**Run the Development Server:**

```bash
NODE_OPTIONS="--conditions react-server" npx vite
# or
npx vite
```

Both these commands show the same application with roughly the same developer experience.

**React Condition System**

The `react-server` condition is needed for the ESM system to consume the React dependencies. What it boils down to is the following semantics:

- When we say we want to "render HTML", it means we need the client environment
- When we say we want to "render RSC", it means we need the server environment

Just like HTML, RSC is simply a string. It's the serialized product of your React Components. Since it's serialized, we are free to send it back and forth from one thread to another using worker threads. This plugin enables exactly this worker thread approach by managing the React condition for you. This explains why both:

```bash
NODE_OPTIONS="--conditions react-server" npx vite
# or
npx vite
```

Return the same application, but we now understand that the former will need an `html-worker` and the latter will need the `rsc-worker` to both serialize RSC and HTML.

**Visit your app:** Open `http://localhost:5173` in your browser. You should see "Hello from /" displayed.

**What's Next?**
- Add more pages to `build.pages` array
- Create server actions with `"use server"`
- Add client components with `"use client"`
- Customize your HTML template

## Development & Build

The plugin supports both traditional multi-step builds and modern Environment API builds:

### Traditional Build (Multi-Step)

```bash
# Build all environments separately
npm run build:static    # vite build
npm run build:client    # vite build --ssr  
npm run build:server    # NODE_OPTIONS="--conditions react-server" vite build
```

**Note**: The traditional build approach is supported but may need configuration adjustments for proper server environment handling.

### Environment API Build (Single-Step)

The plugin now supports Vite's Environment API with two modes:

#### Server-First Mode (Faster)
```bash
NODE_OPTIONS='--conditions react-server' vite build --app
```
- **Static generation** on main thread
- **HTML rendering** via html-worker
- **Benefits**: Faster execution, easier debugging, direct component access

#### Client-First Mode (Isolated)
```bash
vite build --app
```
- **Static generation** on RSC worker thread  
- **HTML rendering** on main thread
- **Benefits**: Server thread isolation, custom RSC worker support

### Automatic Environment Detection

The plugin uses Node.js conditions to automatically load the correct implementation:

```typescript
// The plugin automatically detects and loads the right implementation
import { getCondition } from './config/getCondition.js';

const condition = getCondition(); // Returns 'client' or 'server'
const { vitePluginReactServer } = await import(`./plugin.${condition}.js`);
```

### Development Scripts

#### Traditional approach:

This has the benefit of controlling and debugging each build separately

```json
{
  "type": "module",
  "scripts": {
    "dev:rsc": "NODE_OPTIONS='--conditions react-server' vite",
    "dev:ssr": "vite",
    "build": "NODE_OPTIONS='--conditions react-server' vite build --app",
    "preview": "vite preview"
  }
}
```

### Development Modes

The plugin supports two development paradigms. Both produce **identical output** but differ in architecture:

| Mode | Condition | Command | Architecture | Benefits |
|------|-----------|---------|--------------|----------|
| **RSC** | `react-server` | `npm run dev:rsc` | RSC on main thread | Easier debugging, React in config |
| **SSR** | `null` (default) | `npm run dev:ssr` | RSC in worker | Better isolation, traditional SSR split |

### Development Mode Details

- **`npm run dev:rsc`** (RSC Mode):
  - Main thread has `react-server` condition
  - RSC processing runs directly (no worker)
  - Easier debugging - breakpoints work in server components
  - Supports React in config files (e.g., `vite.react.config.tsx`)

- **`npm run dev:ssr`** (SSR Mode):
  - Main thread is client-focused
  - RSC processing runs in isolated worker thread
  - Closer to traditional SSR/client architecture

### Build Process

- **`npm run build`** (Build Environment):
  1. **Static Build:** `vite build` → `dist/static/`
  2. **Client Build:** `vite build --ssr` → `dist/client/`
  3. **Server Build:** `NODE_OPTIONS="--conditions react-server" vite build --ssr` → `dist/server/` + final `dist/static/`
     - `use client`/`use server` boundary transformations
     - `index.html` and `index.rsc` to `dist/static/${route}` for each `build.pages`

- **`npm run dev-build`**:
  - Debug the build process
  - Avoids the "this error message is hidden in production" and shows the full error
  - Development build is not intended for production

## React condition

The plugin automatically adapts to different execution environments using Node.js conditions:

### Environment Detection

```typescript
import { getCondition } from "vite-plugin-react-server/config";

if (getCondition() !== "react-server") {
  throw new Error("-10 poison damage");
}
```

### Execution Modes

- **RSC Mode** (`npm run dev:rsc`):
  - Condition: `react-server` on main thread
  - RSC processing runs directly on the main Vite thread
  - Easier debugging - breakpoints work in server components
  - Supports React in config files

- **SSR Mode** (`npm run dev:ssr`):
  - Condition: default (client-focused main thread)
  - RSC processing runs in isolated worker thread
  - Traditional SSR/client architecture

- **Build Mode** (`npm run build`):
  - Command: `NODE_OPTIONS='--conditions react-server' vite build --app`
  - Builds all Vite environments (client, ssr, server)
  - Generates static HTML files

### Module Structure

The plugin uses condition-based module loading:

```
plugin/
├── index.ts                    # Main entry point with condition detection
├── plugin.client.ts            # Client environment implementation
├── plugin.server.ts            # Server environment implementation
├── dev-server/
│   ├── index.ts                # Condition-based loader
│   ├── index.client.ts         # Client implementation
│   ├── index.server.ts         # Server implementation
│   └── ...                     # Other modules follow same pattern
└── ...
```

This ensures:
- **Client environments** get lightweight, browser-compatible implementations
- **Server environments** get full-featured RSC processing capabilities
- **No runtime overhead** from unused server code in client environments

## Advanced Features

### Props and Routing

```tsx
// Simple string-based routing
export default defineConfig({
  plugins: vitePluginReactServer({
    Page: "src/page/page.tsx",
    props: "src/page/props.ts",
    build: { pages: ["/", "/about"] }
  }),
});
```

### Server Actions

```tsx
// actions.server.ts
"use server";

export async function addTodo(title: string) {
  return { success: true };
}

// Use in components
import { addTodo } from "./actions.server.js";
export function TodoForm() {
  return <form action={addTodo}>...</form>;
}
```

### Client Components

```tsx
// src/components/Link.client.tsx
"use client";
import React from 'react';

export function Link({ to, children }: { to: string, children: React.ReactNode }) {
  return <a href={to}>{children}</a>;
}
```

```tsx
// Counter.client.tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

**Key Points:**
- Use `"use client"` directive at the top of client component files
- Use `.client.` suffix in filenames for auto-discovery
- Client components can use React hooks and browser APIs
- They're automatically transformed and optimized during build



## Requirements

- **Node.js**: 23.7.0 or higher
- **React**: Experimental version (handled by vendored ESM transport)
- **Vite**: Compatible with latest Vite versions

## TypeScript

The plugin provides virtual modules (like `virtual:react-server/hmr`) that need type declarations. Add `"vite-plugin-react-server/virtual"` to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": [
      "vite/client",
      "vite-plugin-react-server/virtual"
    ]
  }
}
```

This enables type support for:
- `virtual:react-server/hmr` — RSC hot module replacement utilities (`useRscHmr`, `setupRscHmr`)

## Contributing

This project uses experimental React features with a vendored ESM transport (`react-server-dom-esm`). Plugin maintainers can refresh the vendored copy with `npm run experimental:build-oss`. See [React Type Compatibility](./docs/react-type-compatibility.md) for maintenance details.

## Documentation

| Topic | Description |
|-------|-------------|
| [Getting Started](./docs/getting-started.md) | Installation, basic setup, and first page |
| [Core Concepts](./docs/core-concepts.md) | React conditions, environments, and architecture |
| [Configuration Guide](./docs/configuration.md) | Plugin options and Vite config |
| [CSS & Styling](./docs/css-handling.md) | CSS collection, inline styles, and global CSS |
| [Server Actions](./docs/server-actions.md) | `"use server"` directives and form actions |
| [Build & Deployment](./docs/build-orchestration.md) | Multi-step and Environment API builds |
| [Advanced Development](./docs/advanced-topics.md) | Custom workers, streaming, and advanced patterns |
| [Plugin Internals](./docs/transformer-plugin.md) | How the transformer processes directives |
| [Worker System](./docs/rsc-worker.md) | RSC and HTML worker architecture |
| [API Reference](./docs/api-reference.md) | Exported functions and types |
| [React Compatibility](./docs/react-type-compatibility.md) | Version support, vendored ESM transport |
| [Troubleshooting](./docs/troubleshooting-guide.md) | Common errors and solutions |
| [Package Exports](./docs/package-exports.md) | All package exports and conditional loading |
| [Transformations](./docs/transformations.md) | Code transformations and directive handling |


## License

MIT License - see [LICENSE](./LICENSE) file for details.