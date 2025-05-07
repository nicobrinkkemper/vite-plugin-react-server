# Static Site Generation

The Vite React Server Plugin provides powerful static site generation (SSG) capabilities, allowing you to pre-render your React Server Components into static HTML and RSC files.

## Overview

Static site generation with this plugin:

1. Pre-renders your React Server Components into static HTML files
2. Generates corresponding "headless" RSC files for client-side hydration
3. Enables easy deployment to any static hosting service
4. Fully customize production html using the react `Html` component
5. Fully customize production css using the react `CssCollector` component

Direct references to React components (like `Html` and `CssCollector`) are only used in react-server build mode.

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
    hash: "hash", // becomes -[hash]
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
    inlineThreshold: 4096, // Size threshold for inlining
  },
};
```

See the [CSS Handling](./css-handling.md) document for more details.