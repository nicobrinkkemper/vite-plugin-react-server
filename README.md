# Vite React Server Plugin

A Vite plugin that enables React Server Components (RSC) streaming and static HTML page generation. It leverages experimental dependencies from React, specifically `react-server-dom-esm`.

## Example Projects

- [The official demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)
- [The mmcelebration.com project](https://github.com/nicobrinkkemper/mmc)

## Installation

```sh
npm install -D vite-plugin-react-stream
```

## Open Source and Work in Progress

This project uses the latest *OSS-experimental* React version from [the official React GitHub repository](https://github.com/facebook/react). The plugin includes a patch system to facilitate setup. First, install dependencies and patches:

```sh
npm install -D patch-package react@experimental react-dom@experimental react-server-dom-esm
```

Add the following command to your `package.json` scripts:

```json
"patch": "check-react-version && patch"
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

---

## Plugin Structure and Purpose

### Strict Client-Server Separation

This plugin enforces a **strict architectural separation** between client and server execution. It achieves this by requiring **distinct entry files** for both environments, preventing unintended dependencies or cross-thread interactions. While this approach improves maintainability and clarity, it requires additional boilerplate.

The separation is accomplished through two complementary plugins:

- **vite-plugin-react-server/client** → Handles client-side rendering and ESM bundling
- **vite-plugin-react-server** → Manages server-side streaming and RSC processing

This ensures that client-side and server-side concerns remain isolated from the beginning, reducing potential inconsistencies.

## Plugin Usage

### vite-plugin-react-server/client

Used in `vite.config.ts` for standard Vite client-side behavior:

```ts
import { defineConfig, Plugin } from "vite";
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactClient(config) as Plugin[],
});
```

#### Build Steps

```sh
vite build
```
Outputs React client-side ESM files to `dist/client`.

```sh
vite build --ssr
```
Outputs files for server-side execution to `dist/server`.

```sh
vite preview
```
Serves the static directory. Requires pre-built static files.

---

### vite-plugin-react-server

Used in `vite.server.config.ts`, this plugin strictly separates client and server execution and automatically handles SSR output.

```ts
import { defineConfig, Plugin } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactServer(config) as Plugin[],
});
```

#### Running in Development

```sh
NODE_OPTIONS="--conditions=react-server" vite --config vite.server.config.ts
```

#### Build Steps

```sh
vite build
```
Generates client-side and server-side output. The plugin ensures proper SSR handling without requiring `--ssr` manually.

---

## Static Site Generation

When the client and server build step are completed, the latter generates `index.rsc` and `index.html` for each configured route in `dist/static`. It also copies the contents of the client directory as well as any css file that might be used by the client but is otherwise only references by the server-side code. When running the server build, the plugin is smart enough the hash the css files it knows will be copied to the static directory later. A user is free to disable the hash using the build option
```ts
{ 
  moduleBase: "src"
  build: {
     hash: "hash", // change to "" to disable hashing 
  }
}

Example output structure:

```sh
dist/static/index.html
dist/static/index.rsc
dist/static/about/index.html
dist/static/about/index.rsc
```

The entire `dist/client` directory is copied into `dist/static`, allowing easy deployment by moving the static folder to a hosting service.

---

## Configuration

### moduleBase

```ts
const config = {
  moduleBase: "src",
}
```
Defines the root directory for project modules. This can be customized.

### moduleBasePath

```ts
moduleBasePath: "",
```
Passed as the second argument to `renderToPipeableStream` for server-side rendering.

### moduleBaseURL

```ts
moduleBaseURL: packJson.homepage,
```
Defines asset URL resolution for CSS collectors. Supports relative paths (`""`) or absolute paths (e.g., CDN URLs).

### Page and props Mapping

```ts
Page: (id) => join(id.replace('index.rsc',''), 'page.tsx')
```
Defines how pages are mapped to file paths.
```ts
props: (id) => join(id.replace('index.rsc',''), 'props.ts')
```
Defines how to load the initial props of the page file.

If you do not want prop files, just don't define it.
```ts
pageExport: 'Page',
```
Changes the default name "Page"
```ts
propsExport: 'props',
```
Changes the default name "props"

---

## Example Setup

### package.json Scripts

```json
"scripts": {
  "build": "build:client && build:server",
  "dev": "NODE_OPTIONS='--conditions react-server' vite --config vite.server.config.ts",
  "dev:client": "vite",
  "build:server": "NODE_OPTIONS='--conditions react-server' vite build --config vite.server.config.ts",
  "build:client": "vite build"
}
```

### Sample Page Component

```tsx
// src/my-page.tsx
export const Page = ({ name }) => {
  return <div>Hello {name}</div>;
};
```

### Sample Props File

```ts
// src/my-props.ts
export const props = {
  name: "John Doe",
};
```

### Vite Configuration Files

#### Client Configuration (`vite.config.ts`)

```ts
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: vitePluginReactClient(),
});
```

#### Server Configuration (`vite.server.config.ts`)

```ts
import { vitePluginReactServer } from "vite-plugin-react-server";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: vitePluginReactServer(),
});
```

---

```sh
NODE_OPTIONS='--conditions react-server' npx vite --config vite.server.config.ts
```

In development mode, the server plugin pipes the React stream directly to the response.

```sh
NODE_OPTIONS='--conditions react-server' npx vite build --config vite.server.config.ts
```
This builds the `dist/server` directory. It sets ssr to true by default, so you can't forget to. Additionally, when the build is done it generates the `dist/static` directory using the /static plugin.

---

## Summary

- **Strict Client-Server Separation** → Ensures modularity and maintainability
- **Static Site Generation** → Produces deployable HTML and RSC files
- **Dual RSC Implementation** → Supports direct streaming and worker-based approaches
- **Customizable Module Loading** → Allows flexible project configurations

This plugin provides a workflow for React Server Components within Vite, balancing **performance, modularity, and ease of use**.

