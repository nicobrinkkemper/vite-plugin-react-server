# Static Site Generation

The Vite React Server Plugin provides powerful static site generation (SSG) capabilities, allowing you to pre-render your React Server Components into static HTML and RSC files.

## Overview

Static site generation with this plugin:

1. Pre-renders your React Server Components into static HTML files
2. Generates corresponding "headless" RSC files for client-side hydration
3. Copies all client assets to the static directory
4. Enables easy deployment to any static hosting service
5. Fully customize production html using the react `Html` component
6. Fully customize production css using the react `CssCollector` component

Direct references to React components (like `Html` and `CssCollector`) are only used in react-server mode.

## Using the Static Plugin

We need both the client and server directory for this to run. The idea is that we first run the client build using the client plugin like normal `vite build`. Now we need to make the server build, the recommended way is to now use the server plugin for the ssr build like so `NODE_OPTIONS="--conditions react-server" vite build --config vite.server.config.ts`. This will run both the server build and once that's done the static plugin will start.

### Custom Configuration

As said before, we need the client and server directories for this static build process. If you only want to make these two directories, it's also possible to use the `--ssr` flag on the client plugin which will just make the server directory without the static build. If we choose that path, we could single out the static build process like so: 

```ts
// vite.static.config.ts
import { defineConfig, Plugin } from "vite";
import { reactStaticPlugin } from "vite-plugin-react-server/static";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: [reactStaticPlugin(config)],
});
```

### Build Process

1. **Build Client**: `vite build` (outputs to `dist/client`)
2. **Build Server**: `vite build --ssr` (outputs to `dist/server`)
3. **Build Static**: `vite build --config vite.static.config.ts` Run the static plugin (outputs to `dist/static`)

OR 

1. **Build Client**: `vite build` (outputs to `dist/client`)
2. **Build Server & static**: `NODE_OPTIONS="--conditions react-server" vite build --config vite.server.config.ts` (outputs to both `dist/server` and `dist/static`)

### Output Structure

The static plugin generates the following structure:

```
dist/static/
├── index.html
├── index.rsc
├── about/
│   ├── index.html
│   └── index.rsc
├── assets/
│   └── ... (client assets)
└── ... (other static files)
```

## Deployment

The `dist/static` directory can be deployed to any static hosting service:

- GitHub Pages
- Netlify
- Vercel
- AWS S3
- etc.

Simply upload the contents of the `dist/static` directory to your hosting service.

## Customizing Static Generation

### Page Configuration

Configure which pages to generate in your shared config:

```ts
export const config = {
  // ... other config
  build: {
    pages: ["/", "/about", "/blog"],
  },
};
```

### Output Directory

Customize the output directory structure:

```ts
export const config = {
  // ... other config
  build: {
    dir: "dist",     // Base directory
    client: "client", // Client assets directory
    server: "server", // Server assets directory
    static: "static", // Static output directory
  },
};
```

### File Hashing

Configure file hashing for cache busting:

```ts
export const config = {
  // ... other config
  build: {
    hash: "hash", // Adds hash to client files
  },
};
```

## Advanced Static Generation

### Custom HTML Template

You can customize the HTML template used for static generation:

```ts
export const config = {
  // ... other config
  Html: ({ children, pageProps }) => (
    <html>
      <head>
        <title>{pageProps.title || "My Site"}</title>
        <meta name="description" content={pageProps.description} />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  ),
};
```

### CSS Handling

Configure how CSS is handled in static generation:

```ts
export const config = {
  // ... other config
  CSS: {
    inlineCss: true, // Inline CSS in HTML
    purgeCss: true,  // Remove unused CSS
    inlineThreshold: 4096, // Size threshold for inlining
  },
};
```

See the [CSS Handling](./css-handling.md) document for more details.