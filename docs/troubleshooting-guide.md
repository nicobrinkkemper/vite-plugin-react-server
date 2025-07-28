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
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)
2.	[Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)
3.	[Configuration](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)
4.	[Component Resolution](./component-resolution.md)
	- [Path-based vs Direct Components](./component-resolution.md#path-based-vs-direct-components)
	- [When to Use Each Approach](./component-resolution.md#when-to-use-each-approach)
	- [Migration Guide](./component-resolution.md#migration-guide)
5.	[CSS Handling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)
6.	[Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)
7.	[Static Site Generation](./static-site-generation.md)
	- [Static Plugin](./static-site-generation.md#static-plugin)
	- [Build Process](./static-site-generation.md#build-process)
	- [Deployment Strategies](./static-site-generation.md#deployment-strategies)
8.	[Build Orchestration](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)
9.	[Architecture](./architecture.md)
	- [Design Philosophy](./architecture.md#design-philosophy)
	- [Environment Variables](./architecture.md#environment-variables)
	- [Plugin Composition](./architecture.md#plugin-composition)
	- [HTML Component Support](./architecture.md#html-component-support)
10.	[Advanced Topics](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)
11.	[API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)
12.	[Transformations](./transformations.md)
	- [Code Transformations](./transformations.md#code-transformations)
	- [Directive Handling](./transformations.md#directive-handling)
	- [Build Output Examples](./transformations.md#build-output-examples)
13.	[Transformer Plugin](./transformer-plugin.md)
	- [Plugin Architecture](./transformer-plugin.md#plugin-architecture)
	- [Transformation Process](./transformer-plugin.md#transformation-process)
	- [Directive Handling](./transformer-plugin.md#directive-handling)
14.	[Loader](./loader.md)
	- [React Server Components Loader](./loader.md#react-server-components-loader)
	- [Directive Processing](./loader.md#directive-processing)
	- [Module Boundaries](./loader.md#module-boundaries)
	- [Custom Registration Functions](./loader.md#custom-registration-functions)
15.	[Custom Loader](./custom-loader.md)
	- [Creating Custom Loaders](./custom-loader.md#creating-custom-loaders)
	- [Loader Configuration](./custom-loader.md#loader-configuration)
	- [Integration Examples](./custom-loader.md#integration-examples)
16.	[RSC Worker](./rsc-worker.md)
	- [Worker Architecture](./rsc-worker.md#worker-architecture)
	- [Message Handling](./rsc-worker.md#message-handling)
	- [Performance Optimization](./rsc-worker.md#performance-optimization)
17.	[HTML Worker](./html-worker.md)
	- [HTML Generation](./html-worker.md#html-generation)
	- [Stream Processing](./html-worker.md#stream-processing)
	- [Worker Communication](./html-worker.md#worker-communication)
18.	[React Type Compatibility](./react-type-compatibility.md)
	- [Type System Overview](./react-type-compatibility.md#type-system-overview)
	- [Generic Types](./react-type-compatibility.md#generic-types)
	- [Version Compatibility](./react-type-compatibility.md#version-compatibility)
19.	[Patch System](./patch-system.md)
	- [React Version Compatibility](./patch-system.md#react-version-compatibility)
	- [Creating Patches](./patch-system.md#creating-patches)
	- [Maintenance Guide](./patch-system.md#maintenance-guide)
20.	[Practical Guide](./practical-guide.md)
	- [Real-world Examples](./practical-guide.md#real-world-examples)
	- [Debugging Features](./practical-guide.md#debugging-features)
	- [Production Implementations](./practical-guide.md#production-implementations)
21.	**[Troubleshooting Guide](./troubleshooting-guide.md) ← you are here**
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

