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
  "scripts": {
    "dev": "NODE_OPTIONS='--conditions react-server' vite",
    "dev:client": "vite",
    "build": "vite build && vite build --ssr && NODE_OPTIONS='--conditions react-server' vite build",
    "debug-build": "NODE_ENV=development && vite build --mode vite build --mode development && NODE_OPTIONS='--conditions react-server' vite build",
  }
}
```

- **`npm run dev`**: Server-side development with direct React pipeline
- **`npm run dev:client`**: Client-side development with worker threads
- **`npm run build`**: Creates optimized static, client, and server builds

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

## Testing

The plugin includes 235 test cases across 20 test files covering:
- Build processes (static, client, server)
- Server action integration
- Error handling and edge cases
- Type safety and React compatibility
- Performance with large outputs

## Documentation

| Topic | Description |
|-------|-------------|
| [Getting Started](./docs/getting-started.md) | Complete installation and setup guide |
| [Core Concepts](./docs/core-concepts.md) | Architecture, RSC, and plugin design |
| [Configuration](./docs/configuration.md) | All configuration options and examples |
| [CSS Handling](./docs/css-handling.md) | CSS collection, inlining, and optimization |
| [Server Actions](./docs/server-actions.md) | Server-side functions and database integration |
| [Static Site Generation](./docs/static-site-generation.md) | Building and deploying static sites |
| [API Reference](./docs/api-reference.md) | Complete API documentation |
| [Advanced Topics](./docs/advanced-topics.md) | Custom workers and extending the plugin |

## Requirements

- **Node.js**: 23.7.0 or higher
- **React**: Experimental version (handled by patch system)
- **Vite**: Compatible with latest Vite versions

## Contributing

This project uses experimental React features and includes a patch system for compatibility. See [Patch System](./docs/patch-system.md) for maintenance details.

## License

MIT License - see [LICENSE](./LICENSE) file for details.
