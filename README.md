# Vite React Server Components Plugin

A Vite plugin that enables React Server Components (RSC) without a full-stack framework. Uses experimental dependencies from React, specifically `react-server-dom-esm/server.node`.

## Features

- 🚀 Zero-config React Server Components
- 🔄 Use vite like you would nextjs

## Installation

```bash
npm install vite-react-stream
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { viteReactStreamPlugin } from 'vite-react-stream'

// Custom router example
const createRouter = (fileName: string) => (url: string) => {
  try {
    return new URL(`file://./src/page${url}/${fileName}`).pathname
  } catch (e) {
    return `src/page/404/${fileName}`
  }
};

export default defineConfig({
  plugins: [
    viteReactStreamPlugin({
      moduleBase: "/src",
      Page: createRouter("page.tsx"),
      props: createRouter("props.ts"),
      pageExportName: "Page",
      propsExportName: "props",
      build: {
        output: {
          dir: "dist",
          rsc: "rsc",
        },
      },
    })
  ]
})
```

## Server Components

Create server components in your pages directory:

```typescript
// src/pages/pokemon.tsx
export function Page({ pokemon }) {
  return <div>It's a {pokemon.name}!</div>
}
```

## Page Props

Define props for your pages:

```typescript
// src/props/pokemon.ts
export const props = {
  pokemon: async () => {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon-form/399/")
    return res.json()
  }
}
```

## Client Entry

```typescript
// src/client.tsx
import { createFromFetch } from "react-server-dom-esm/client";

const rscData = createFromFetch(
  fetch(window.location.href, {
    headers: { Accept: "text/x-component" },
  }),
  {
    moduleBaseURL: window.location.origin + '/',
  }
);

// ... rest of client setup
```

## HTML Template

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link href="src/index.css" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client.tsx"></script>
  </body>
</html>
```

## Notes

- Requires `NODE_OPTIONS="--conditions=react-server"` for the Vite process
- CSS files are automatically collected and streamed
- Components are streamed only when visited
- Supports both sync and async props

## License

MIT



