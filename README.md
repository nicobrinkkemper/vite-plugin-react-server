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
npm install -D vite-plugin-react-server patch-package react@experimental react-dom@experimental react-server-dom-esm
npm run patch
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

The plugin automatically detects your execution environment and provides the optimal implementation:

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

This has the benefit of controlling and debugging each build seperately

```json
{
  "type": "module",
  "scripts": {
    "dev": "NODE_OPTIONS='--conditions react-server' vite",
    "dev:client": "vite",
    "build": "npm run build:static && npm run build:client && npm run build:server",
    "build:static": "vite build",
    "build:client": "vite build --ssr",
    "build:server": "NODE_OPTIONS='--conditions react-server' vite build --ssr",
    "dev-build": "npm run dev-build:static && npm run dev-build:client && npm run dev-build:server",
    "dev-build:static": "NODE_ENV=development vite build --mode development",
    "dev-build:client": "NODE_ENV=development vite build --mode development --ssr",
    "dev-build:server": "NODE_ENV=development NODE_OPTIONS='--conditions react-server' vite build --ssr --mode development"
  }
}
```

App build:
This uses the appBuilder, which is experimental. The plugin will use the main thread condition for all the tasks.
This means that one task will always run in the "sub optimal" main thread environment.

```json
{
  "build": "vite build --app",
}

### Development Modes

Both development modes provide **identical user experiences** - they both start your application and it will work the same way in the browser. The difference is purely internal implementation.

| Mode | Condition | Command | Internal Implementation | Benefits |
|------|-----------|---------|----------------------|----------|
| **RSC Worker** | `null` | `npm run dev:client` | RSC Worker Thread | Default Vite behavior, worker isolation |
| **Direct Server** | `react-server` | `npm run dev` | Direct Main Thread | No worker overhead, better debugging |

### Development Mode Details

- **`npm run dev`** (Direct Server Mode):
  - Condition: `react-server`
  - Direct RSC processing in main thread (no worker overhead)
  - Better debugging experience for server components
  - More efficient for server-side development

- **`npm run dev:client`** (RSC Worker Mode):
  - Condition: `null` (default)
  - Uses RSC worker thread for server component processing
  - Worker thread isolation
  - Good for testing client-side behavior

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

- **RSC Worker Mode** (Condition: `null`):
  - Command: `vite` or `npm run dev:client`
  - Uses RSC worker thread for server component processing
  - Worker thread isolation
  - Good for testing client-side behavior

- **Direct Server Mode** (Condition: `react-server`):
  - Command: `NODE_OPTIONS="--conditions react-server" vite` or `npm run dev`
  - Direct React Server Components processing in main thread
  - No worker thread overhead
  - Better debugging experience for server components
  - More efficient for server-side development

- **Build Mode** (Condition: `react-server` for final step):
  - Command: `npm run build`
  - Build-time environment for static generation
  - Runs all three build steps in sequence
  - HTML worker only used during builds (not development)

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
// React components configure routing
const createRouter = (file) => (url) => {
  switch (url) {
    case "/": return `src/home/${file}`;
    case "/about": return `src/about/${file}`;
    default: return `src/404/${file}`;
  }
};

export default defineConfig({
  plugins: vitePluginReactServer({
    Page: createRouter("page.tsx"),
    props: createRouter("props.ts"),
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
// Counter.client.tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```



## Requirements

- **Node.js**: 23.7.0 or higher
- **React**: Experimental version (handled by patch system)
- **Vite**: Compatible with latest Vite versions

## Contributing

This project uses experimental React features and includes a patch system for compatibility. See [Patch System](./docs/patch-system.md) for maintenance details.

## Documentation

| Topic |
|-------|
| [Getting Started](./docs/getting-started.md) |
| [Core Concepts](./docs/core-concepts.md) |
| [Configuration Guide](./docs/configuration.md) |
| [CSS & Styling](./docs/css-handling.md) |
| [Server Actions](./docs/server-actions.md) |
| [Build & Deployment](./docs/build-orchestration.md) |
| [Advanced Development](./docs/advanced-topics.md) |
| [Plugin Internals](./docs/transformer-plugin.md) |
| [Worker System](./docs/rsc-worker.md) |
| [API Reference](./docs/api-reference.md) |
| [React Compatibility](./docs/react-type-compatibility.md) |
| [Troubleshooting](./docs/troubleshooting-guide.md) |
| [Package Exports](./docs/package-exports.md) |


## License

MIT License - see [LICENSE](./LICENSE) file for details.