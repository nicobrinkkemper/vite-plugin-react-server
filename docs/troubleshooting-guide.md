# Troubleshooting Guide
This guide covers common errors, gotchas, and solutions when working with the Vite React Server Plugin.

## Common Errors and Solutions

### 🔍 **Missing Detailed Stack Traces**

**Problem**: You're not seeing detailed error information in the browser.

**Solution**: Open the browser's Developer Console (F12) to see full stack traces and error details.

**Why**: The plugin streams detailed error information to the console, not just the rendered page.

### 📦 **@types/react Version Mismatch**

**Problem**: TypeScript errors or runtime issues, especially when using linked packages.

**Error Examples**:
```
Type 'X' is not assignable to type 'Y'
Cannot find module 'react'
'Root' cannot be used as a JSX component.
Its type 'ComponentType<RootProps>' is not a valid JSX element type.
```

**Solution**: Ensure all React-related packages have matching versions:

```json
{
    "react": "^0.0.0-experimental-0ff1d13b-20250507",
    "react-dom": "^0.0.0-experimental-0ff1d13b-20250507",
    "react-server-dom-esm": "^0.0.1",
    "@types/react": "^19.0.9",
    "@types/react-dom": "^19.0.3",
}
```

**For React Version Compatibility**: The plugin uses generic types to avoid React version conflicts. Make sure you're using the correct type imports:

```tsx
import React from "react";
import type { HtmlProps } from "vite-plugin-react-server/types";

type MyPageProps = {
  title: string;
  user: { name: string; email: string };
};

type MyHtmlProps = HtmlProps<MyPageProps>;

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
        cssFiles={cssFiles}
        Page={Page}
        pageProps={pageProps}
      />
    </body>
  </html>
);
```

### 🔧 **Postinstall Script Didn't Run**

**Problem**: Patches not applied after `npm install some-package`.

**Error**: `react-server-dom-esm` related errors or missing functionality.

**Solution**: 
The postinstall only runs after `npm install` without arguments. Assuming your `package.json` already has:
```json
{
  "scripts": {
    "postinstall": "patch-package"
  }
}
```
You could run
```sh
npm install some-thing;
npm run postinstall
```

### 🚫 **"use client" Directive Issues**

**Problem**: Client components not working or throwing errors.

**Common Issues**:
- Missing `"use client"` at the top of client component files
- Client components imported from server components without `.client.` suffix
- Client components used as boundaries between server and client code

### 🔧 **Transformer Plugin Not Installed**

**Problem**: Sourcemap errors indicating the transformer plugin isn't working.

**Error Example**:
```
src/components/Link.client.tsx (1:0): Error when using sourcemap for reporting an error: Can't resolve original location of error.
```

**Solution**: This error typically means the transformer plugin wasn't installed or added to the Vite configuration. Ensure the plugin is properly configured in your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { vitePluginReactServer } from 'vite-plugin-react-server';

export default defineConfig({
  plugins: [
    vitePluginReactServer({
      // your plugin options
    })
  ]
});
```

**Why**: The transformer plugin is responsible for removing the directives and handling the transformation accordingly. This means that
for the client-boundary transformations, not much changes aside from the directive being removed. It's not critical to see this warning,
because the end result is the same (use client directive is removed). It's only critical to miss the transformer plugin in the server
environment.

### 🔧 **Environment API Not Working**

**Problem**: Vite Environment API builds only one environment instead of all configured environments.

**Error**: Only getting `build.writeBundle.client` but not `build.writeBundle.server`, or vice versa.

**Solution**: Use `createBuilder()` instead of `build()` for Environment API:

```typescript
import { createBuilder } from "vite";

const builder = await createBuilder({
  plugins: vitePluginReactServer(options),
  environments: {
    client: { build: { ssr: false, outDir: "dist/client" } },
    server: { build: { ssr: true, outDir: "dist/server" } },
  },
});

await builder.buildApp();
```

**Note**: The standard `build()` function doesn't properly support Environment API. Always use `createBuilder()` for multi-environment builds.

### 🔧 **Dev Server Plugin Environment Detection Issues**

**Problem**: The server-side dev server plugin is running in a client-consuming environment, causing `SyntaxError: Cannot use import statement outside a module`.

**Error Examples**:
```
SyntaxError: Cannot use import statement outside a module
```

**Root Cause**: The `consumer` property is not properly set in the environment configuration. Without `consumer: "server"`, the server-side dev server plugin runs in a client-consuming environment, which uses the module runner compatibility mode and tries to process server code in a browser context.

**Solution**: Add the `consumer` property to make the module runner disappear. Both SSR and server environments should have `consumer: "server"` because they both run on the server side:

```typescript
// In createEnvironmentPlugin.ts or similar
consumer: envConfig.name === "server" || envConfig.name === "ssr" ? "server" : "client",
```

**Important**: Do not override the SSR consumer - both SSR and server environments should have `consumer: "server"` because they both execute on the server, not in the browser.

**Why This Matters**: When the server-side dev server plugin runs in a client-consuming environment, Vite uses the module runner compatibility mode which tries to process server code in a browser context, causing the import statement errors.

**Note**: This is confusing because "client" in our context means "client boundary" (React client components), but Vite's `consumer` property refers to whether the code runs in the browser (`"client"`) or on the server (`"server"`). Both SSR and server environments run on the server, so they both need `consumer: "server"`.

**The Fix**: The solution is NOT to remove or change import statements, but rather to add `consumer: "server"` to make Vite stop using the module runner compatibility mode for server environments.

### 🌐 **CORS Errors During Preview**

**Problem**: Cross-origin request blocked when accessing RSC files during preview.

**Error Examples**:
```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://127.0.0.1:4173/vite-plugin-react-server-demo-official/index.rsc. (Reason: CORS header 'Access-Control-Allow-Origin' missing). Status code: 200.

Uncaught TypeError: NetworkError when attempting to fetch resource.
```

**Solution**: Ensure you're using `localhost` consistently, not `127.0.0.1`.

**Why**: When the `publicOrigin` is set to `localhost` but you access the site via `127.0.0.1`, it creates a cross-origin request that requires CORS headers. It may load and fail, the createReactFetcher utility ensures consistent publicOrigin is used.

**Steps to Fix**:
1. **Option 1**: Access your preview server using `localhost:4173` instead of `127.0.0.1:4173`

### 🛡️ **Error Boundaries**

**Problem**: Need to handle errors gracefully in your application.

**Solution**: Use error boundaries to catch and display errors:

```tsx
// src/components/ErrorBoundary.client.tsx
"use client";
import React from "react";
import { ErrorMessage } from "./ErrorMessage.js";

export class ErrorBoundary extends React.Component {
  public state: {
    hasError: boolean;
    error: Error | null;
  } = {
    hasError: false,
    error: null,
  };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.log("[ErrorBoundary] Caught error:", error.message);
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.state.error) {
        return (
          <ErrorMessage
            error={{
              message: this.state.error.message,
              stack: this.state.error.stack,
            }}
          />
        );
      }
      return <div>Error</div>;
    }
    return this.props.children;
  }
}
```

```tsx
// src/components/ErrorMessage.tsx
"use client";
import React from "react";

export function ErrorMessage({ error }: { error: { message: string; stack?: string } }) {
  return (
    <div data-testid="error-boundary">
      <h2>Error</h2>
      <p data-testid="error-message">{error.message}</p>
      {error.stack && (
        <details>
          <summary>Stack trace</summary>
          <pre>{error.stack}</pre>
        </details>
      )}
    </div>
  );
}
```

**Usage in your page:**
```tsx
// src/page/page.tsx
import React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.client.js";
import { TestError } from "../components/TestError.js";

export function Page(props: any) {
  return (
    <div>
      <h1>Error Boundary Test</h1>
      <ErrorBoundary>
        <TestError throwError={props.throwError} />
      </ErrorBoundary>
    </div>
  );
}
```
2. **Option 2**: Configure your `publicOrigin` to match the actual origin being used:
   ```typescript
   export default {
     // ... other config
     publicOrigin: "http://localhost:4173", // this ensures the publicOrigin is always the same 
   } satisfies StreamPluginOptions;
   ```
3. Ensure the preview server is running with the correct condition: `vite build --app` then `vite preview`

**Solution**: 
1. Ensure client components have `"use client"` as the first line
2. Use `.client.` suffix in filenames for auto-discovery
3. Check component boundaries

**Directive Placement**: Ensure directives are placed correctly:

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
  "use server"; // ✅ Function-level directive
  // server code
}
```

### 🔄 **Worker Thread Errors**

**Problem**: Worker processes hanging or crashing.

**Common Causes**:
- Worker startup taking too long (especially on slower machines)
- RSC requests timing out before completion
- Worker shutdown not properly cleaning up resources

**Solutions**:
1. **Worker startup timeout**: If workers take too long to start, increase `htmlWorkerStartupTimeout` and `rscWorkerStartupTimeout` in your config
2. **RSC request timeout**: If RSC requests are timing out, increase `rscTimeout` (default 5000ms)
3. **Worker cleanup**: Ensure workers are properly terminated - the plugin now handles this automatically

**Timeout Configuration Options**:
```ts
export const config = {
  // ... other config
  htmlWorkerStartupTimeout: 10000, // 10 seconds for HTML worker startup
  rscWorkerStartupTimeout: 10000,  // 10 seconds for RSC worker startup  
  rscTimeout: 10000,               // 10 seconds for RSC request completion
  htmlTimeout: 30000,              // 30 seconds for HTML generation completion
};
```

### ⏱️ **Stream Timeout Issues**

**Problem**: Client-side RSC streams consistently timing out after exactly 3 seconds, even for simple operations.

**Root Cause**: The plugin had two competing timeout mechanisms:
1. **Worker timeout** (5 seconds): Handles actual RSC rendering
2. **Client PassThrough timeout** (3 seconds): Was forcefully ending streams before worker completion

**Solution**: The plugin now uses only the worker timeout mechanism. Client streams wait for natural completion instead of artificial timeouts. If the process indeed should take this long, increate timeout using the correct user option:
```typescript
export const config = {
  rscTimeout: 30000, // 30 sec timeout
  htmlTimeout: 3000,
}
```

**Performance Impact**:
- **Before**: RSC streams would timeout at 3 seconds regardless of actual work
- **After**: RSC streams complete naturally in 5-30ms
- **Improvement**: 100-600x faster for normal operations

**Note**: Timeouts are only used as safety nets for infinite loops during development, not during normal operation.

### 🌐 **Environment Variable Issues**

**Problem**: Plugin not detecting correct environment.

**Solution**: The plugin automatically detects the environment based on `NODE_OPTIONS`. For server-side rendering, ensure your build scripts include:

```json
{
  "scripts": {
    "build:server": "NODE_OPTIONS='--conditions react-server' vite build"
  }
}
```

### 🏗️ **Build Errors**

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

Make sure you are making the requests using the `Accept: "text/x-component"` header to the module or re-export of the module. `actions.js#getTodos`

### ⚡ **Performance Script Appearing in HTML Output**

**Problem**: You notice that your HTML output includes a performance script (`requestAnimationFrame(function(){$RT=performance.now()});`) regardless of environment, which you didn't expect.

**Symptoms**:
- HTML includes: `<script>requestAnimationFrame(function(){$RT=performance.now()});</script>`
- This script appears in your generated HTML files
- You're probably doing something custom with React streaming

**Root Cause**: You're likely calling `pipe()` at a later point in time instead of starting the stream immediately. This triggers React's suspense code path, which adds the performance script.

**Solution**: Start streaming right away instead of waiting. Move the `pipe()` call to immediately after getting the `pipe` function.

**Code Fix**:
```typescript
// Before (triggers suspense code):
const { pipe } = ReactDOMServer.renderToPipeableStream(result.children, {
  onShellReady() {
    pipe(passThrough); // ❌ Called later - triggers suspense
  },
});

// After (no suspense trigger):
const { pipe } = ReactDOMServer.renderToPipeableStream(result.children, {
  onShellReady() {
    // Shell ready callback without pipe call
  },
});

// Pipe called immediately after getting the function
pipe(passThrough); // ✅ Called immediately - no suspense trigger
```

**Why This Happens**: When you pipe at any point later than immediately after getting the function, React thinks you're dealing with suspense boundaries and adds the performance script as part of its internal timing mechanism.

### 📁 **Module Resolution Errors**

**Problem**: Cannot find modules or incorrect imports.

**Common Issues**:
- Missing `.js` extensions in imports
- Incorrect module paths
- Case sensitivity issues

**Solution**:
1. Always use `.js` extensions in imports (even for TypeScript files)
2. Use absolute paths from project root
3. Check file casing matches exactly

### 🎨 **CSS Collection Issues**

**Problem**: Styles not loading or CSS not collected properly.

**Solutions**:
1. Ensure CSS files are imported in server components
2. Check CSS collector configuration
3. Verify CSS file paths are correct

### 🔗 **Server Actions Not Working**

**Problem**: Server actions throwing errors or not executing.

**Common Issues**:
- Missing `"use server"` directive
- Incorrect import paths
- Form action configuration

**Solution**:
1. Ensure `"use server"` is at the top of server action files
2. Use correct import paths with `.js` extensions
3. Check form action configuration

### ⚡ **Build Performance Issues**

**Problem**: Slow builds or memory issues.

**Solutions**:
1. Use separate build steps for large applications
2. Optimize CSS collection
3. Consider disabling unused features
4. Use production mode for final builds

### 🔍 **Debugging Tips**

#### Enable Verbose Logging

```ts
export const config = {
  // ... other config
  verbose: true,
};
```

#### Check Worker Logs

Look for worker-related messages in the console for debugging worker issues.

#### Use Error Boundaries

Wrap problematic components in error boundaries to isolate issues:

```tsx
"use client";
import { ErrorBoundary } from "./ErrorBoundary.client.js";

export const Page = () => {
  return (
    <ErrorBoundary>
      <ProblematicComponent />
    </ErrorBoundary>
  );
};
```



### 🚨 **Common Gotchas**

1. **File Extensions**: You can simply always use `.js` extensions in imports, even for TypeScript files
2. **Client Components**: Must have `"use client"` directive and `.client.` suffix for auto-discovery
3. **Server Actions**: Must have `"use server"` directive at the top of the file or at beginning of the function
4. **Environment Detection**: Plugin behavior changes based on `NODE_OPTIONS`
5. **Worker Timeouts**: Adjust timeouts for large applications or slow development machines
6. **CSS Collection**: CSS must be imported in server components to be collected
7. **Module Resolution**: Use absolute paths and correct casing for imports

### 🔧 **Getting Help**

If you're still experiencing issues:

1. Check the [GitHub Issues](https://github.com/nicobrinkkemper/vite-plugin-react-server/issues)
2. Review the [API Reference](./api-reference.md)
3. Look at [example projects](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
4. Enable verbose logging and check console output
5. Create a minimal reproduction case

### 📋 **Checklist for New Projects**

- [ ] All React packages have matching versions
- [ ] Postinstall script is configured
- [ ] Patches are applied (`npm run patch`)
- [ ] Environment variables are set correctly
- [ ] Client components have `"use client"` directive
- [ ] Server actions have `"use server"` directive
- [ ] Import paths use `.js` extensions
- [ ] CSS files are imported in server components
- [ ] Error boundaries are in place for debugging

## Diagnostic Commands

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	[CSS & Styling](./css-handling.md)
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./advanced-topics.md)
8.	[Plugin Internals](./transformer-plugin.md)
9.	[Worker System](./rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	**[Troubleshooting](./troubleshooting-guide.md) ← you are here**
13.	[Package Exports](./package-exports.md)
14.	[Transformations](./transformations.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->







