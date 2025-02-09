# Vite React Server Components Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static building of html pages. Uses experimental dependencies from React, specifically `react-server-dom-esm`.

## Features

- 🚀 Super fast static build times
- 🔄 Use vite to create your personal meta-framework
- ⚡ Full RSC streaming support
- 📦 Dual-worker architecture for optimal performance
- 🔧 Automatic client/server code splitting
- 🎯 Directive-based component targeting

## Example Project

The [mmcelebration.com project](https://github.com/nicobrinkkemper/mmc) uses this plugin. Build time for ~200 html pages is just a few seconds.

## Installation

```bash
npm install vite-plugin-react-server
```

### React Canary Setup

This plugin requires React's experimental features. You'll need to:

1. Install react-server-dom-esm (currently an empty stub package):
```bash
npm install react-server-dom-esm
```

2. Apply the patch:
```bash
npx vite-plugin-react-server/patch
```
This will:
- Detect your installed React version
- Adapt the patch accordingly
- Create `patches/react-server-dom-esm+YOUR-REACT-VERSION.patch`

3. Install patch-package:
```bash
npm install patch-package --save-dev
```

4. Add to package.json:
```json
{
  "scripts": {
    "postinstall": "patch-package"
  }
}
```

Alternative: You can build React from source and use `npm link` for react-server-dom-esm, react, and react-dom (though the patch system is recommended).

## Basic Configuration

```typescript
// vite.react-server.config.ts
import { defineConfig } from 'vite'
import type { Options } from 'vite-plugin-react-server'

// Custom router example
const createRouter = (file: 'props.ts' | 'Page.tsx') => (url: string) => {
  if(url.includes('bidoof')) return `src/page/bidoof/${file}`
  if(url === '/index.rsc') return `src/page/${file}`;
  return `src/page/404/${file}`;
}

export const streamPluginOptions: Options = {
  moduleBase: "src",
  Page: createRouter('Page.tsx'),
  props: createRouter('props.ts'),
  pageExportName: "Page",
  propsExportName: "props",
}
```

### Client Build Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { viteReactStreamPlugin } from 'vite-plugin-react-server/client'
import { streamPluginOptions } from './vite.react-server.config.js'

export default defineConfig({
  plugins: [viteReactStreamPlugin(streamPluginOptions)]
})
```

### Server Build Config

```typescript
// vite.server.config.ts
import { defineConfig } from 'vite'
import { viteReactStreamPlugin } from 'vite-plugin-react-server/server'
import { streamPluginOptions } from './vite.react-server.config.js'

export default defineConfig({
  plugins: [viteReactStreamPlugin(streamPluginOptions)]
})
```

### Scripts Setup

```json
{
  "scripts": {
    "start": "NODE_OPTIONS=--conditions=react-server vite",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "NODE_OPTIONS=--conditions=react-server vite build --ssr --config vite.server.config.ts",
    "test:server": "NODE_OPTIONS=--conditions=react-server vitest --config vite.server.config.ts"
  }
}
```

## Component Types

### Server Components (Default)
```tsx
// src/page/pokemon/page.tsx
export function Page({ pokemon }) {
  return <div>Its a {pokemon.name}!</div>
}
```

### Page Props
```tsx
// src/page/pokemon/props.ts
export const props = async () => {
  const res = await fetch("https://pokeapi.co/api/v2/pokemon-form/399/")
  return res.json()
}
```

### Client Components
Use the "use client" directive for client-side features:
```tsx
"use client"
import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

### Server Actions
Use the "use server" directive for server-side API endpoints:
```tsx
"use server"
export async function submitForm(data: FormData) {
  // Server-side logic
}
```

## Notes

- Requires `NODE_OPTIONS="--conditions=react-server"` for the Vite process
- CSS files are automatically collected and link tags emitted
- Components are streamed only when visited
- Supports both sync and async props, and all kinds of combinations I haven't tried or tested yet!

## License

MIT

## FAQ

### Why does this plugin use two separate workers?

The plugin uses a dual-worker architecture to handle the complex boundary between server and client code in React 19's new paradigm. This design enables four key scenarios:

1. **Pure Client** - Client-side React rendering
2. **Pure Server** - Server-side RSC streaming
3. **Client-with-server-worker** - Thread WITHOUT React server conditions using dependencies that are ONLY available using the server condition
4. **Server-with-client-worker** - Thread WITH React server conditions using dependencies that are ONLY available WITHOUT the server condition

This architecture is necessary because React 19 introduces a fundamental shift in how server/client boundaries work. While React was traditionally client/browser-oriented, version 19 moves much of the functionality to the server by default.

## When to use which directive?

The "use client" should be used for components that use client-only things, like hooks - browser window, localStorage, etc.


The "use server" directive is *not* for server components, it's for server actions. Every component is a server component by default. If the "use server" directive is present, 
this plugin will register it as a server action - which means you can intend the exported functions to be API endpoints.

## What about .client.tsx files, .server.tsx files?

Whenever you use the directive, it's recommended to also name the file with the .client.tsx or .server.tsx extension respectively.
While this isn't required for the plugin to work - it's the only way to make sure all client and server files are included in the build - 
even if they are not a main entry point.

### What's the deal with NODE_OPTIONS and conditions?

The React Server Components system requires specific Node conditions:

- `NODE_OPTIONS='--conditions=react-server'` is required for RSC functionality (generating RSC streams)
- This condition must NOT be present for client-side React operations (generating HTML from RSC streams)

The plugin recommends using the react-server condition in the main thread to enable React server features from the start. When different conditions are needed (e.g., generating static HTML), the plugin uses workers with appropriate conditions.

### Why start with "use client"?

With React 19's server-first approach, many existing ecosystem tools and patterns need the "use client" directive to work as they did before. It's becoming a common pattern to start with "use client" to maintain compatibility with existing code while gradually adopting the new server-first paradigm.



