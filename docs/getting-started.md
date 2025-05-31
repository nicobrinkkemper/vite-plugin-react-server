
# Getting Started

This guide will help you get started with the Vite React Server Plugin, which enables React Server Components (RSC) streaming and static HTML page generation.

## Installation

Install the plugin and its dependencies:

```sh
# Install the plugin
npm install -D vite-plugin-react-server

# Install required React dependencies
npm install -D patch-package react@experimental react-dom@experimental react-server-dom-esm
```

## Setting Up Patches

The plugin includes a patch system to facilitate setup. Add the following command to your `package.json` scripts:

```json
"patch": "patch"
```

Run the patch command:

```sh
npm run patch
```

It will instruct you to add:

```json
"postinstall": "patch-package"
```

This ensures the patch is applied after every `npm install`. If errors arise related to `react-server-dom-esm`, verify that the postinstall step ran.

## Basic Setup

### 1. Create Configuration Files

Create a shared configuration file (let's call it `vite.react.config.ts`):

```ts
import type { StreamPluginOptions } from "vite-plugin-react-server/types";

const createRouter = (file: "props.ts" | "page.tsx") => (url: string) => {
  switch (url) {
    case "/":
      // static url
    case "/index.rsc":
      return `src/page/${file}`;
    default:
      throw new Error(`Unknown route: ${url}`);
  }
};

export const config = {
  moduleBase: "src",
  Page: createRouter("page.tsx"),
  props: createRouter("props.ts"),
  Html: ({ children }) => (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  ),
  build: {
    pages: ["/"],
  },
} satisfies StreamPluginOptions;
```

### 2. Create Client Configuration

Create `vite.config.ts` for client-side rendering:

```ts
import { defineConfig } from "vite";
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactClient(config),
});
```


### 4. Create Page Components

Create a page component at `src/page/page.tsx`:

```tsx
export const Page = ({ name }) => {
  return <div>Hello {name}</div>;
};
```

Create a props file at `src/page/props.ts`:

```ts
export const props = ({url})=>({
  name: "World",
  url,
});
```

### 4. Add Scripts to package.json

```json
"scripts": {
  "build": "build:static && build:client && build:server",
  "dev": "NODE_OPTIONS='--conditions react-server' vite",
  "start": "vite",
  "build:server": "NODE_OPTIONS='--conditions react-server' vite build",
  "build:client": "vite build --ssr",
  "build:static": "vite build"
}
```

## Running the Application

### Development Mode

```sh
# Run server-side rendering
npm run dev

# Run client-side development
npm run dev:client
```

### Building for Production

```sh
# Build everything
npm run build

# Or build separately
npm run build:client
npm run build:server
```

## Example Projects

For more examples, check out these projects:

- [The official demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
- [The mmcelebration.com project](https://github.com/nicobrinkkemper/mmc)

These examples demonstrate various features and configurations of the plugin in real-world applications. 