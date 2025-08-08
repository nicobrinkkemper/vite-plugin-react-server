# Build & Deployment

This guide covers the build process, static site generation, and deployment strategies for the Vite React Server Plugin.

## Build Architecture

The plugin provides build system support for React Server Components (RSC) and static HTML page generation through three specialized plugins:

### 1. Client Plugin (`vite-plugin-react-server/client`)
- Bundles static & client boundary ESM modules
- Executes without the react-server condition
- Manages the `rsc-worker` process

### 2. Server Plugin (`vite-plugin-react-server/server`)
- Bundles server boundary ESM modules
- Executes with the react-server condition enabled
- Handles RSC execution in the main thread

### 3. Static Plugin (`vite-plugin-react-server/static`)
- Serializes all props & pages in build.pages to `dist/static`
- Outputs onMetric events
- Outputs onEvent with build information

### 4. Transformer Plugin (`vite-plugin-react-server/transformer`)
- Handles `transformModuleIfNeeded` for client/server boundary
- Maintain hashes with static manifest
- Determines final module id for components

### 5. Env Plugin (`vite-plugin-react-server/env`)
- Loads & Checks the environment on launch
- Sets and unsets default VITE_ process variables early
- Makes process.env available even in the config step

## Build Process

The build process executes in the following sequence:

### 1. Static Build (`vite build`)
- Generates client-side ESM files in `dist/static`
- Creates static manifest
- Processes CSS modules
- Outputs browser-optimized code

### 2. Client Boundary Build (`vite build --ssr`)
- Generates client-boundary ssr files in `dist/client`
- Same as the static, but with bare specifier imports intended for ssr
- Outputs Node.js-optimized code
- Uses the same hashes as static build for consistency

### 3. Server Boundary Build (`NODE_OPTIONS="--conditions=react-server" vite build`)
- Generates RSC content
- Outputs Node.js-optimized code
- Uses the same hashes as static build for consistency
- Upgrades `dist/static` directory with fixed index.html/.rsc files

## Build Output Structure

The build generates the following directory structure:

```
dist/
├── static/
    ├── index.html          # Generated HTML
    ├── index.rsc           # Headless RSC content
│   └── .vite/manifest.json # Main manifest
├── client/
│   └── ...                 # React client boundary
├── server/
│   └── ...                 # React server boundary
```

## Environment Variables

The plugin treats process.env similar to `import.meta.env`:

1. **Server-Side Access**: Environment variables are available in server components through `process.env`
2. **Build-Time Resolution**: During the build process, environment variables are resolved and injected into the bundle
3. **Mode Handling**: The plugin respects both `NODE_ENV` and `VITE_MODE`, with `NODE_ENV` taking precedence
4. **Default Variables**: Several environment variables are automatically set if not provided:
   - `VITE_MODE`: Set based on build mode or `NODE_ENV`
   - `VITE_DEV`: Boolean indicating development mode
   - `VITE_PROD`: Boolean indicating production mode
   - `VITE_SSR`: Boolean indicating server-side rendering
   - `VITE_PUBLIC_ORIGIN`: Base URL for public assets
   - `VITE_BASE_URL`: Base URL for the application

## HTML Component Support

The plugin treats HTML files as first-class React components:

### Development Mode
- Uses Vite's built-in `index.html` for development client entry
- Leverages Vite's dev server and HMR
- RSC requests are handled by the development server
- No need for custom HTML component during development
- Headless streams still support link, meta and title changes

### Production Mode
- Uses custom `Html` component for static generation
- Generates proper HTML structure with head and body using React server components
- Handles CSS collection and injection
- Creates static HTML files for each route
- Headless stream is saved to file index.rsc
- Full Html document to index.html

### Preview Server (Post-Build)
- Used to serve static files after a build (`vite preview`)
- The `configurePreviewServer` middleware handles RSC file serving
- Serves `.rsc` files with `text/x-component` MIME type
- Provides proper error handling for static file requests
- Hosts the configured `dist/static` folder

### Stream Types

#### Headless RSC streams
- Used for client-side navigation between pages
- Saved as `index.rsc` files
- More efficient as it only updates necessary parts of the DOM
- Still contains CSS/head information that can bubble up to the head
- Used in development mode for RSC streaming

#### Full RSC streams
- Used during build under the `react-server` condition
- Generates complete HTML documents with proper structure
- Includes `<html>`, `<head>`, and `<body>` tags
- Creates static HTML files for each route
- Used in production mode for static generation
- Server side render of client-side code using the `html-worker`

Both streams provide detailed stack traces when run under `NODE_ENV=development`.

## Build Configuration

### Basic Configuration

```typescript
export const config = {
  build: {
    pages: ["/", "/about"], // Routes to generate
    dir: "dist", // Base output directory
    client: "client", // Client assets directory
    server: "server", // Server assets directory
    static: "static", // Static output directory
    hash: "hash", // Client file hashing
    preserveModulesRoot: false, // Module path preservation
  },
} satisfies StreamPluginOptions;
```

### Advanced Build Options

```typescript
export const config = {
  build: {
    pages: ["/", "/about", "/contact"],
    dir: "dist",
    client: "client",
    server: "server", 
    static: "static",
    hash: "hash",
    preserveModulesRoot: false,
    assetsDir: "assets",
    api: "api",
    outDir: "dist",
    rscOutputPath: "index.rsc",
    htmlOutputPath: "index.html",
    entryFile: (chunk, ssr) => `entry-${ssr ? 'server' : 'client'}.js`,
    chunkFile: (chunk, ssr) => `chunk-${chunk.name}.js`,
    assetFile: (asset, ssr) => `asset-${asset.name}`,
    extensionMap: {
      ".js": ".js",
      ".ts": ".js",
      ".jsx": ".js",
      ".tsx": ".js",
    },
    moduleExtension: ".js",
    jsExtension: ".js",
    cssExtension: ".css",
    htmlExtension: ".html",
    jsonExtension: ".json",
    rscExtension: ".rsc",
    cssModuleExtension: ".css.js",
    nodeExtension: ".node",
  },
};
```

## Deployment Strategies

### Static Site Deployment

The generated `dist/static` folder can be deployed to any static hosting service:

#### GitHub Pages
```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist/static
```

#### Netlify
```toml
# netlify.toml
[build]
  publish = "dist/static"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### Vercel
```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist/static",
  "framework": null
}
```

### Server-Side Rendering Deployment

For server-side rendering, deploy the entire `dist` folder:

```typescript
// server.js
import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);

// Serve static files
app.use(express.static(join(__dirname, 'dist/static')));

// Handle RSC requests
app.get('*.rsc', (req, res) => {
  res.setHeader('Content-Type', 'text/x-component');
  // Serve RSC files
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Environment-Specific Builds

### Development Mode
- Uses Vite's dev server
- Provides error messages and stack traces
- Enables source maps
- Hot module replacement

### Production Mode
- Optimizes code output
- Minimizes bundle sizes
- Generates static files
- Performance optimizations

### Testing Mode
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { vitePluginReactServer } from 'vite-plugin-react-server';

export default defineConfig({
  plugins: [vitePluginReactServer(config)],
  test: {
    environment: 'node',
    globals: true,
  },
});
```

## Build Requirements

The complete build process requires three sequential builds:

```bash
# 1. Static build
vite build

# 2. Client build  
vite build --ssr

# 3. Server build
NODE_OPTIONS="--conditions=react-server" vite build
```

Or use the combined script:
```bash
npm run build
```

## Performance Optimization

### Build Performance
- Use direct components for static builds
- Configure appropriate CSS inlining thresholds
- Optimize worker timeouts for your environment
- Use build caching when possible

### Runtime Performance
- Implement proper error boundaries
- Use streaming for large content
- Optimize CSS collection and processing
- Monitor metrics during builds

### Memory Management
- Configure appropriate worker memory limits
- Clean up resources after processing
- Monitor memory usage during builds
- Use garbage collection appropriately

## Troubleshooting Builds

### Common Issues

1. **Build Failures**: Check environment variables and Node.js version (requires 23.7.0+)
2. **Missing Files**: Verify file paths and export names
3. **CSS Issues**: Check CSS configuration and file patterns
4. **Worker Timeouts**: Adjust timeout settings for your environment

### Debug Builds

```typescript
export const config = {
  verbose: true,
  onEvent: (event) => {
    console.log('Build event:', event);
  },
  onMetrics: (metrics) => {
    console.log('Build metrics:', metrics);
  },
};
```

### Build Validation

The plugin includes comprehensive build validation:
- File existence checks
- Export name validation
- CSS file processing verification
- Worker communication testing
- Performance metrics collection

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->


1.	[Getting Started](./getting-started.md)
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)
2.	[Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)
3.	[Configuration Guide](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)
4.	[CSS & Styling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)
5.	[Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)
6.	**[Build & Deployment](./build-orchestration.md) ← you are here**
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)
7.	[Advanced Development](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)
8.	[Plugin Internals](./transformer-plugin.md)
	- [Plugin Architecture](./transformer-plugin.md#plugin-architecture)
	- [Transformation Process](./transformer-plugin.md#transformation-process)
	- [Directive Handling](./transformer-plugin.md#directive-handling)
9.	[Worker System](./rsc-worker.md)
	- [Worker Architecture](./rsc-worker.md#worker-architecture)
	- [Message Handling](./rsc-worker.md#message-handling)
	- [Performance Optimization](./rsc-worker.md#performance-optimization)
10.	[API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)
11.	[React Compatibility](./react-type-compatibility.md)
	- [Type System Overview](./react-type-compatibility.md#type-system-overview)
	- [Generic Types](./react-type-compatibility.md#generic-types)
	- [Version Compatibility](./react-type-compatibility.md#version-compatibility)
12.	[Troubleshooting](./troubleshooting-guide.md)
	- [Common Issues](./troubleshooting-guide.md#common-issues)
	- [Debugging Tips](./troubleshooting-guide.md#debugging-tips)
	- [Performance Optimization](./troubleshooting-guide.md#performance-optimization)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->







