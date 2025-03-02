# Vite React Server Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static building of html pages. Uses experimental dependencies from React, specifically `react-server-dom-esm`.


## Example Projects

- [The official demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
- [The mmcelebration.com project](https://github.com/nicobrinkkemper/mmc)

## Installation

```ts
npm install -D vite-plugin-react-stream
```

## Open source and work in progress

This project uses the latest* oss-experimental React version taken from [the offical React github repository](https://github.com/facebook/react). This plugin offers a patch system that can get you up and running quickly. First run `npm install -D patch-package react@experimental react-dom@experimental react-server-dom-esm` and add the follow command to the scripts
```json
"patch": "check-react-version && patch",
```
Now run `npm run patch` to create the patch. It will tell you to add this as well:
```json
"postinstall": "patch-package",
```
This will apply the patch for us after running `npm install`

If errors start showing up related to the missing `react-server-dom-esm` package - it's likely the postinstall step didn't run.

## Included plugins
### vite-plugin-react-server/client
- Client build
- Server Worker thread (rsc-worker)

### vite-plugin-react-server
- Server build
- Client Worker thread (html-worker)

### vite-plugin-react-server/preserver
- Preserves "use client" and "use server" condition in source code

### vite-plugin-react-server/transformer
- Transforms client components for server environment or vice versa

### vite-plugin-react-server/worker/html
- Create your own html worker (client side worker)
- Make html worker part of the application

### vite-plugin-react-server/worker/rsc
- Create your own rsc worker (server side worker)
- Make rsc worker part of the application

## Configuration
For client and server boundaries to work, it's very important to know which environment (or thread) the system is in. Let's setup the client first. 
```ts
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { config } from "./config.js";
import { defineConfig } from "vite";
export default defineConfig(()=> {
  return {
    plugins: vitePluginReactClient(config),
  }
});
```
The client plugin can help to quickly setup a client side build that'll work with the server build. It also allows you to serve the application. To handle the rsc streams, it uses the rsc-worker. You can read more about the rsc-worker [here](/docs)

```ts
import { vitePluginReactServer } from "vite-plugin-react-server";
import { config } from "./config.js";
import { defineConfig } from "vite";
export default defineConfig(()=> {
  return {
    plugins: vitePluginReactServer(config),
  }
});
```
The server plugin will look the same when you serve it, but under the hood works quite differently. This plugin requires you to write `NODE_OPTIONS="--conditions=react-server" vite --ssr --config vite.server.config.ts`. Aside from building the server dist files, it will populate the client's folder with index files for all your routes.

```ts
import React from "react"

export const config = {
  // set the root dir
  moduleBase: "src",
  // map the id to any page/prop file
  Page: (id)=>'page.tsx'),
  props: (id)=>'props.ts',
  // production html (not used during development)
  Html: ({ children, url }) => (
    <html>
      <title>{url}</title>
      <body>{children}</body>
    </html>
  ),
  build: {
    // routes to build index.html and index.rsc files for
    pages: ["/", "/about"],
  },
};
```

### Scripts Setup

```json
{
  "scripts": {
    "start": "vite",
    "dev": "NODE_OPTIONS=--conditions=react-server vite --config vite.server.config.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "NODE_OPTIONS=--conditions=react-server vite build --ssr --config vite.server.config.ts",
    "test:server": "NODE_OPTIONS=--conditions=react-server vitest",
    "test:client": "vitest",
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
