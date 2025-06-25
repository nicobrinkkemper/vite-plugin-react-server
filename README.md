# Vite React Server Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static HTML page generation.

- Type Safe
- Server first

## What separates this from other React projects?

When you add this plugin to Vite, all aspects of Vite change to accommodate a "Native ESM" workflow for React.

**React becomes part of your build tooling** - not just a dependency.

### Vite's Philosophy + React

[Vite's philosophy](https://vite.dev/guide/philosophy.html) is built around Native ESM and making frameworks first-class citizens. This plugin extends that philosophy to React:

- **Native ESM for React**: Your React components are true ESM modules that work anywhere
- **React as Configuration**: Use React components to configure your build (Html, Root, Pages)
- **Framework-First**: React Server Components are built into the development and build pipeline
- **No Bundler Lock-in**: Generated modules work with any ESM-compatible system
- **On-Demand Loading**: Only streams the pages you're actually developing

#### Development Efficiency

During development, the plugin only loads what you need:

```tsx
// Large application with 100+ pages
export default defineConfig({
  plugins: vitePluginReactServer({
    Page: (url) => {
      // Only the visited page gets loaded and compiled
      switch (url) {
        case "/": return "src/home/page.tsx";
        case "/dashboard": return "src/dashboard/page.tsx";
        case "/profile": return "src/profile/page.tsx";
        // ... 97 other pages that won't load until visited
      }
    }
  }),
});
```

**Benefits:**
- **Fast Startup**: Application starts instantly regardless of size
- **Memory Efficient**: Only active pages consume memory
- **True ESM**: Each page is a separate module loaded on-demand
- **Hot Reload**: Changes only affect the current page

### The Difference

```tsx
// Traditional: React is a dependency, build tools are separate
import { defineConfig } from "vite";
export default defineConfig({
  // HTML template as string
  // CSS handling as config
  // React as external dependency
});

// This plugin: React IS the build configuration
import { vitePluginReactServer } from "vite-plugin-react-server";
export default defineConfig({
  plugins: vitePluginReactServer({
    // React components configure the build
    Html: ({ children, pageProps }) => <html><body>{children}</body></html>,
    Root: ({ cssFiles }) => cssFiles.map(css => <link href={css.href} />),
    Page: (url) => `src/pages${url}.tsx`,
  }),
});
```

### Native ESM Workflow

Just like Vite pushes modern web standards, this plugin pushes modern React patterns:

- **ESM-only**: All React modules are true ES modules
- **Server Components**: Native RSC streaming without framework lock-in
- **Build-time React**: React components generate your build configuration
- **Standard Modules**: Output works with Next.js, Remix, or any ESM system

## Quick Start

```sh
npm install -D vite-plugin-react-server patch-package react@experimental react-dom@experimental react-server-dom-esm
npm run patch
```

**Configure with React:**

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
    plugins: vitePluginReactServer({
      moduleBase: "src",
    Page: (url) => `src/page.tsx`,
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
    "build": "vite build && vite build --ssr && NODE_OPTIONS='--conditions react-server' vite build"
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

## Example Projects

- **[Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)** - Simple playground with GitHub Pages deployment
  - [Live Demo](https://nicobrinkkemper.github.io/vite-plugin-react-server-demo-official/)
- **[MMC Project](https://github.com/nicobrinkkemper/mmc)** - Production implementation with advanced features
  - [Live Demo](https://nicobrinkkemper.github.io/mmc/)

## Build Output

The plugin generates three build targets:

```
dist/
├── static/     # Browser-ready static files (HTML + RSC)
├── client/     # Server-side rendering modules  
└── server/     # React Server Components modules
```

## Testing

The plugin includes 269 test cases across 34 test files covering:
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
