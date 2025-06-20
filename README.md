# Vite React Server Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static HTML page generation. It leverages experimental dependencies from React, specifically `react-server-dom-esm`.

## Open Source and Work in Progress

This project uses the latest _OSS-experimental_ React version from [the official React GitHub repository](https://github.com/facebook/react). The plugin includes a patch system to facilitate setup.

## Quick Start

```sh
# Install the plugin and dependencies
npm install -D vite-plugin-react-server patch-package react@experimental react-dom@experimental react-server-dom-esm

# Set up patches (required for React compatibility)
npm run patch
```

Add to your `package.json`:
```json
{
  "scripts": {
    "patch": "patch",
    "postinstall": "patch-package"
  }
}
```

## Basic Setup

**1. Configure Vite:**

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

**2. Create a Page Component:**

```tsx
// src/page.tsx
export function Page({ url }) {
  return <div>Hello from {url}</div>;
}
```

**3. Create Client Entry:**

```tsx
// src/client.tsx
import React, { use } from "react";
import { createRoot } from "react-dom/client";
import { createReactFetcher } from "vite-plugin-react-server/utils";

const Shell = ({ data }) => {
  const content = use(data);
  return content;
};

const rootElement = document.getElementById("root");
const initialData = createReactFetcher({
  url: window.location.pathname,
  moduleBaseURL: import.meta.env.BASE_URL,
});

createRoot(rootElement).render(<Shell data={initialData} />);
```

**4. Add index.html:**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client.tsx"></script>
  </body>
</html>
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

This plugin uses environment detection to determine the execution context. It achieves this by checking the `NODE_OPTIONS` environment variable:

```typescript
import { getCondition } from "vite-plugin-react-server/config";

if (getCondition() !== "react-server") {
  throw new Error("-10 poison damage");
}
```

The plugin automatically adapts based on your environment:

- **Client Mode** (default): Uses worker threads for RSC requests, detailed error logging
- **Server Mode** (`NODE_OPTIONS="--conditions react-server"`): Direct React pipeline, optimized performance

## Advanced Features

### Props and Routing

```tsx
// Custom router function
const createRouter = (file) => (url) => {
  switch (url) {
    case "/": return `src/home/${file}`;
    case "/about": return `src/about/${file}`;
    default: return `src/404/${file}`;
  }
};

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: createRouter("page.tsx"),
    props: createRouter("props.ts"), // Optional props files
    build: { pages: ["/", "/about"] }
  }),
});
```

### Server Actions

```tsx
// actions.server.ts
"use server";

export async function addTodo(title: string) {
  // Server-side logic here
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

The plugin generates three optimized build targets:

```
dist/
├── static/     # Browser-ready static files (HTML + RSC)
├── client/     # Server-side rendering modules  
└── server/     # React Server Components modules
```

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
