# Getting Started

This guide will help you get up and running with the Vite React Server Plugin quickly.

## Installation

```bash
npm install vite-plugin-react-server
```

## Basic Setup

### 1. Create Vite Config

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [
    vitePluginReactServer({
      moduleBase: "src",
      Page: (route) => `src/pages${route}page.tsx`,
      props: (route) => `src/pages${route}props.ts`,
      build: { pages: ["/", "/about/"] }
    })
  ]
});
```

### 2. Create Page Components

```tsx
// src/pages/page.tsx
export const Page = ({ title }: { title: string }) => (
  <div>
    <h1>{title}</h1>
    <p>Welcome to my app!</p>
  </div>
);
```

```ts
// src/pages/props.ts
export const props = {
  title: "Home Page"
};
```

### 3. Add Package Scripts

```json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--conditions react-server' vite",
    "dev:client": "vite",
    "build": "vite build && vite build --ssr && NODE_OPTIONS='--conditions react-server' vite build",
    "preview": "vite preview"
  }
}
```

## Development Modes

### Direct Server Mode (Recommended)
```bash
npm run dev
```
- No worker overhead
- Direct RSC processing
- Better debugging experience

### RSC Worker Mode
```bash
npm run dev:client
```
- Uses worker threads
- Isolated ESM environment
- Custom `rsc-worker` development

## Common Use Cases

### Static Site Generation

```ts
export const config = {
  moduleBase: "src",
  Page: (route) => `src/pages${route}page.tsx`,
  components: {
    Html: ({ Root, cssFiles, pageProps, Page }) => (
      <html>
        <head>
          <title>{pageProps?.title || "My App"}</title>
        </head>
        <body>
          <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
        </body>
      </html>
    )
  },
  build: { pages: ["/", "/about/", "/contact/"] }
};
// ./react.config.tsx
```

### Server Actions

```tsx
"use server";

export async function submitForm(data: FormData) {
  const name = data.get("name");
  // Process form data
  return { success: true, name };
}
// src/actions/submit-form.server.ts
```

```tsx
import { submitForm } from "../../actions/submit-form.server";
import React from 'react';

export const Page = () => (
  <form action={submitForm}>
    <input name="name" required />
    <button type="submit">Submit</button>
  </form>
);
// src/pages/contact/page.tsx
```

### CSS Handling

```tsx
import { Css } from "vite-plugin-react-server/components";
import React from 'react';

export const Root = ({ cssFiles, Page, pageProps, ...props }) => {
  const filteredCss = Array.from(cssFiles).filter(({id})=>'.vars.') 
  return (
    <div {...props}>
      <Page {...pageProps} />
      <Css cssFiles={filteredCss} />
    </div>
  );
}
// src/components/Root.tsx
```

## Production Build

```bash
npm run build
```

This creates:
- `dist/static/` - Static HTML files
- `dist/client/` - Client-side modules
- `dist/server/` - Server-side modules

## Debugging Features

### Verbose Logging
```ts
export const config = {
  verbose: true,
  // ... other options
};
```

### Error Boundaries
The plugin automatically provides detailed error information in development mode, including component stacks and source locations.

### Hot Module Replacement
- Client components: Full HMR support
- Server components: File-based reloading
- CSS: Real-time updates

## Next Steps

- Read the [Core Concepts](./core-concepts.md) for deeper understanding
- Explore [Configuration Guide](./configuration.md) for advanced options
- Check [Troubleshooting](./troubleshooting-guide.md) if you encounter issues 

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->


1.	**[Getting Started](./getting-started.md) ← you are here**
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
6.	[Build & Deployment](./build-orchestration.md)
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







