# Vite React Server Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static HTML page generation. This plugin enables a unique "Native ESM" developer experience based on the React Server Components specifications.

**React Components as part of your build tooling** - not just as a dependency.

### Vite's Philosophy + React

[Vite's philosophy](https://vite.dev/guide/philosophy.html) is built around Native ESM and making frameworks first-class citizens. This plugin extends that philosophy to React Server Components:

- **Native ESM for React**: Your React components are true ESM modules that work anywhere
- **React as Configuration**: Serialize React Server Components for static hosting
- **On-Demand Loading**: Only streams the pages you're actually developing


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

## Development & Build

The plugin provides two development modes and a build environment:

- **RSC Worker Mode**: Uses RSC worker thread (default Vite behavior)
- **Direct Server Mode**: Direct main thread processing (no worker overhead)  
- **Build Environment**: Static site generation with HTML worker

### Development Scripts

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

### Development Modes

Both development modes provide **identical user experiences** - they both start your application and it will work the same way in the browser. The difference is purely internal architecture.

| Mode | Condition | Command | Internal Architecture | Benefits |
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


## Environment-Based Execution

The plugin uses Node.js conditions to determine execution context:

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

## Build Output

The plugin generates three build targets:

```
dist/
├── static/     # Browser-ready static files (HTML + RSC)
├── client/     # Server-side rendering modules  
└── server/     # React Server Components modules
```


## Requirements

- **Node.js**: 23.7.0 or higher
- **React**: Experimental version (handled by patch system)
- **Vite**: Compatible with latest Vite versions

## Contributing

This project uses experimental React features and includes a patch system for compatibility. See [Patch System](./docs/patch-system.md) for maintenance details.

## Documentation

| Topic | Description |
|-------|-------------|
| [Getting Started](./docs/getting-started.md) | [Installation and Setup](./docs/getting-started.md#installation-and-setup) |
| [Core Concepts](./docs/core-concepts.md) | [Client-Server Separation](./docs/core-concepts.md#client-server-separation) |
| [Configuration](./docs/configuration.md) | [Plugin Options](./docs/configuration.md#plugin-options) |
| [Component Resolution](./docs/component-resolution.md) | [Path-based vs Direct Components](./docs/component-resolution.md#path-based-vs-direct-components) |
| [CSS Handling](./docs/css-handling.md) | [CSS Collectors](./docs/css-handling.md#css-collectors) |
| [Server Actions](./docs/server-actions.md) | [Creating Server Actions](./docs/server-actions.md#creating-server-actions) |
| [Static Site Generation](./docs/static-site-generation.md) | [Static Plugin](./docs/static-site-generation.md#static-plugin) |
| [Build Orchestration](./docs/build-orchestration.md) | [Multiple Build Targets](./docs/build-orchestration.md#multiple-build-targets) |
| [Architecture](./docs/architecture.md) | [Design Philosophy](./docs/architecture.md#design-philosophy) |
| [Advanced Topics](./docs/advanced-topics.md) | [Custom Workers](./docs/advanced-topics.md#custom-workers) |
| [API Reference](./docs/api-reference.md) | [Plugin Options](./docs/api-reference.md#plugin-options) |
| [Transformations](./docs/transformations.md) | [Code Transformations](./docs/transformations.md#code-transformations) |
| [Transformer Plugin](./docs/transformer-plugin.md) | [Plugin Architecture](./docs/transformer-plugin.md#plugin-architecture) |
| [Loader](./docs/loader.md) | [React Server Components Loader](./docs/loader.md#react-server-components-loader) |
| [Custom Loader](./docs/custom-loader.md) | [Creating Custom Loaders](./docs/custom-loader.md#creating-custom-loaders) |
| [RSC Worker](./docs/rsc-worker.md) | [Worker Architecture](./docs/rsc-worker.md#worker-architecture) |
| [HTML Worker](./docs/html-worker.md) | [HTML Generation](./docs/html-worker.md#html-generation) |
| [React Type Compatibility](./docs/react-type-compatibility.md) | [Type System Overview](./docs/react-type-compatibility.md#type-system-overview) |
| [Patch System](./docs/patch-system.md) | [React Version Compatibility](./docs/patch-system.md#react-version-compatibility) |
| [Practical Guide](./docs/practical-guide.md) | [Real-world Examples](./docs/practical-guide.md#real-world-examples) |
| [Troubleshooting Guide](./docs/troubleshooting-guide.md) | [Common Issues](./docs/troubleshooting-guide.md#common-issues) |


## License

MIT License - see [LICENSE](./LICENSE) file for details.
