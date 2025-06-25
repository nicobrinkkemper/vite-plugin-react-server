# Troubleshooting Guide

This guide covers common issues and solutions when using the Vite React Server Plugin.

## Common Issues

### React Version Compatibility

**Problem**: TypeScript errors about React types not being compatible.

```
'Root' cannot be used as a JSX component.
Its type 'ComponentType<RootProps>' is not a valid JSX element type.
```

**Solution**: The plugin uses generic types to avoid React version conflicts. Make sure you're using the correct type imports:

```tsx
import React from "react";
import type { HtmlProps } from "vite-plugin-react-server/types";

type MyPageProps = {
  title: string;
  user: { name: string; email: string };
};

type MyHtmlProps = HtmlProps<MyPageProps, true, "div">;

// Use generic types that adapt to your React version
export const Html = ({
  Root,
  cssFiles,
  pageProps = { title: "My App", user: { name: "User", email: "user@example.com" } },
  Page,
}: MyHtmlProps) => (
  <html>
    <body>
      <Root
        as="div"
        cssFiles={cssFiles}
        Page={Page}
        pageProps={pageProps}
      />
    </body>
  </html>
);
```

### Build Errors

**Problem**: Build fails with "rules of hooks" errors during static generation.

**Solution**: This usually indicates a React version mismatch. Run a development build to see detailed errors:

```json
{
  "scripts": {
    "debug-build": "NODE_ENV=development npm run build:client -- --mode development && NODE_ENV=development npm run build:server -- --mode development"
  }
}
```

**Problem**: Server actions not working in production build.

**Solution**: Ensure you're running all three build steps:

```bash
npm run build:static  # Static assets
npm run build:client  # Client-side rendering
npm run build:server  # Server components and actions
```

### Directive Issues

**Problem**: `"use server"` or `"use client"` directives not working.

**Solution**: Ensure directives are placed correctly:

```tsx
"use server";
// ✅ Correct - at the top of the file

export async function serverAction() {
  // server code
}

// ❌ Incorrect - after other statements
const x = 1;
"use server"; // This won't work
```

For function-level directives:

```tsx
export async function serverAction() {
  "use server"; // ✅ First statement in function
  return await database.query();
}
```

### CSS Issues

**Problem**: CSS not loading or styles missing.

**Solution**: Check your CSS collector configuration:

```tsx
import React from "react";
import { Css } from "vite-plugin-react-server/components";
import type { HtmlProps } from "vite-plugin-react-server/types";

export const Html = ({ 
  Root, 
  cssFiles, 
  globalCss, 
  Page, 
  pageProps 
}: HtmlProps) => (
  <html>
    <head>
      <Css cssFiles={globalCss} />
    </head>
    <body>
      <Root
        as="div"
        cssFiles={cssFiles}
        Page={Page}
        pageProps={pageProps}
      />
    </body>
  </html>
);
```

importing syntax in the client entry indicates globalCss:

```tsx
import "globalStyles.css";
// src/client.tsx
```

in index.html:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Vite React Stream</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/client.tsx"></script> <!-- this will be a client entry  -->
</body>
</html>
```

### Worker Issues

**Problem**: RSC worker timing out or hanging.

**Solution**: Check worker configuration and timeout settings:

```ts
export const config = {
  rscTimeout: 10000, // Increase timeout
  rscWorkerStartupTimeout: 5000,
  htmlWorkerStartupTimeout: 5000,
  // ... other config
};
```

## Debugging Tips

### Enable Verbose Logging

```ts
export const config = {
  verbose: true,
  onEvent: (event) => {
    console.log(`[Plugin] ${event.type}:`, event);
  },
  onMetrics: (metrics) => {
    console.log(`[Plugin] Metrics:`, metrics);
  },
};
```

### Check Build Events

Monitor build events to understand what's happening:

```ts
const events: PluginEvent[] = [];

export const config = {
  onEvent: (event) => {
    events.push(event);
    console.log("Build Event:", event.type);
  },
};
```

### Source Map Debugging

The plugin preserves source maps for debugging. Check that your build tools are configured to use them:

```ts
// vite.config.ts
export default defineConfig({
  build: {
    sourcemap: true,
  },
});
```

### Test Your Setup

Use the plugin's test utilities to verify your setup:

```ts
import { doBuild } from "vite-plugin-react-server/test";

// Test your configuration
const events = await doBuild({
  projectRoot: "./",
  build: { pages: ["/"] },
});

console.log("Build events:", events);
```

## Performance Optimization

### Large HTML Output

For large HTML files, monitor memory usage:

```ts
export const config = {
  onMetrics: (metrics) => {
    if (metrics.htmlSize > 1000000) { // 1MB
      console.warn("Large HTML detected:", metrics);
    }
  },
};
```

### CSS Optimization

Configure CSS inlining thresholds:

```ts
export const config = {
  css: {
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [/\.critical\.css$/],
    linkPatterns: [/node_modules/],
  },
};
```

### Bundle Analysis

Analyze your build output:

```bash
# Check build sizes
ls -la dist/static/
ls -la dist/client/
ls -la dist/server/

# Analyze bundle composition
npx vite-bundle-analyzer dist/static
```

## Error Messages

### Common Error Patterns

1. **"Attempted to call [Component] from the server but [Component] is on the client"**
   - This is expected behavior for client components
   - The error is only thrown if you actually try to call the component function

2. **"Cannot use both 'use client' and 'use server' directives"**
   - Remove one of the conflicting directives
   - Choose based on where the code should run

3. **"Directive must be at the top of the file"**
   - Move the directive before any other statements
   - Remove any comments or whitespace before the directive

### Development vs Production

Some errors only appear in development mode:

```bash
# See full error details
NODE_ENV=development npm run dev

# Production mode (errors are hidden)
NODE_ENV=production npm run build
```

## Getting Help

If you encounter issues not covered here:

1. Check the [test suite](https://github.com/nicobrinkkemper/vite-plugin-react-server/tree/main/test) for examples
2. Review the [API documentation](./api-reference.md)
3. Look at the [example projects](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
4. File an issue on [GitHub](https://github.com/nicobrinkkemper/vite-plugin-react-server/issues)

## Diagnostic Commands

```bash
# Check React versions
npm list react react-dom react-server-dom-esm

# Verify patches are applied
npm run postinstall

# Test build process
npm run debug-build

# Check for TypeScript errors
npx tsc --noEmit
```
