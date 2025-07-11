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
export function Page({ url }) {
  return <div>Hello from {url}</div>;
}
```

## Development & Build

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

With the above scripts in our package.json:

- **`npm run dev`**: 
    - Develop `react-server` components on the main thread
- **`npm run dev:client`**: 
    - Develop `react-server` components using the worker thread (`rsc-worker`)
- **`npm run build`**: 
    - `npm run build:static` -> `dist/static` 
    - `npm run build:client` -> `dist/client`
    - `npm run build:server` -> `dist/server`
      + `use client`/`use server`  boundary transformations
      + `index.html` and `index.rsc` to `dist/static/${route}` for each `build.pages`
- **`npm run dev-build`**:
  - Debug the build process
  - Avoids the "this error message is hidden in production" and shows the full error
  - Development build is not intended for production


## Environment-Based Execution

The plugin uses environment detection to determine execution context:

```typescript
import { getCondition } from "vite-plugin-react-server/config";

if (getCondition() !== "react-server") {
  throw new Error("-10 poison damage");
}
```

- **Client Mode** (default): Uses worker threads for RSC requests
- **Server Mode** (`NODE_OPTIONS="--conditions react-server"`): Direct React pipeline

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
| [Getting Started](./docs/getting-started.md) | Installation and Setup |
| [Core Concepts](./docs/core-concepts.md) | Client-Server Separation |
| [Configuration](./docs/configuration.md) | Plugin Options |
| [CSS Handling](./docs/css-handling.md) | CSS Collectors |
| [Server Actions](./docs/server-actions.md) | Creating Server Actions |
| [Static Site Generation](./docs/static-site-generation.md) | Static Plugin |
| [Build Orchestration](./docs/build-orchestration.md) | Multiple Build Targets |
| [Architecture](./docs/architecture.md) | Design Philosophy |
| [Advanced Topics](./docs/advanced-topics.md) | Custom Workers |
| [API Reference](./docs/api-reference.md) | Plugin Options |
| [Transformations](./docs/transformations.md) | Code Transformations |
| [Loader](./docs/loader.md) | React Server Components Loader |
| [Patch System](./docs/patch-system.md) | React Version Compatibility |
| [Practical Guide](./docs/practical-guide.md) | Real-world Examples |
| [Troubleshooting Guide](./docs/troubleshooting-guide.md) | Common Issues |


## License

MIT License - see [LICENSE](./LICENSE) file for details.
