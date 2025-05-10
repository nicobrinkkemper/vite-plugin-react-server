# Build Orchestration

## Overview

The Vite React Server Plugin provides build system support for React Server Components (RSC) and static HTML page generation. This document describes the build process and component interactions.

## Build Architecture

The plugin consists of two main components:

1. **Client Plugin** (`vite-plugin-react-server/client`)
   - Bundles client-side ESM modules
   - Executes without the react-server condition
   - Manages the `rsc-worker` process

2. **Server Plugin** (`vite-plugin-react-server`)
   - Bundles server-side ESM modules
   - Executes with the react-server condition enabled
   - Handles RSC execution in the main thread

## Build Process

The build process executes in the following sequence:

1. **Client Build** (`vite build`)
   - Generates client-side ESM files in `dist/client`
   - Creates client asset manifest
   - Processes CSS modules
   - Outputs browser-optimized code

2. **Server Build** (`NODE_OPTIONS="--conditions=react-server" vite build`)
   - Resolves assets using client manifest
   - Generates RSC content
   - Creates static output directory
   - Outputs Node.js-optimized code

3. **Static Generation**
   - Copies client assets to `dist/static`
   - Generates HTML files
   - Creates RSC files

## Build Output Structure

The build generates the following directory structure:

```
dist/
├── client/          # Client-side assets
│   ├── assets/      # Bundled client assets
│   └── manifest.json # Client asset manifest
├── server/          # Server-side code
│   └── ...         # Server-specific files
└── static/          # Static site output
    ├── index.html   # Generated HTML
    ├── index.rsc    # RSC content
    └── assets/      # Copied client assets
```

## Environment-Specific Behavior

### Development Mode
- Uses Vite's dev server
- Provides error messages and stack traces
- Enables source maps

### Production Mode
- Optimizes code output
- Minimizes bundle sizes
- Generates static files

## Build Configuration

The build process accepts the following configuration options:

```typescript
export const config = {
  build: {
    pages: ["/", "/about"],  // Routes to generate
    dir: "dist",             // Base output directory
    client: "client",        // Client assets directory
    server: "server",        // Server assets directory
    static: "static",        // Static output directory
    hash: "hash",           // Client file hashing
    preserveModulesRoot: true // Module path preservation
  }
} satisfies StreamPluginOptions;
```

## Build Requirements

1. Client build must complete before server build
2. Server builds require `NODE_OPTIONS="--conditions=react-server"`
3. Module resolution requires consistent `moduleBase` configuration
4. CSS modules require appropriate configuration 