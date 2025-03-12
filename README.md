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

### Custom composition

You can pick and choose only the plugins you like to get the desired behavior as well. For example, we can choose only to use the preserver, the transformer, static plugin, etc.

### Worker support

The client plugin uses the `rsc-worker` to create server side streams. The server plugin uses the `html-worker` to create client side html. If you don't want to use the rsc-worker, simply don't serve the client plugin. If you don't want to use the `html-worker` simply don't configure the `build.pages` option.

### Custom Worker

Both workers can be customized using the `htmlWorkerPath` and `rscWorkerPath` respectively. The paths will be used to create the workers instead of the prebuilt worker included with this plugin. If these paths are defined, they will be made part of your application build as well.

Keep in mind that, using your custom worker means interacting with the message system of this plugin during development/static generation process.


## Plugin Usage

### Configuration
```ts
import type { StreamPluginOptions } from "vite-plugin-react-server/server";

const createRouter = (file: "props.ts" | "page.tsx") => (url: string) => {
  switch (url) {
    case "/bidoof":
    case "/bidoof/index.rsc":
      return `src/page/bidoof/${file}`;
    case "/404":
    case "/404/index.rsc":
      return `src/page/404/${file}`;
    case "/":
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
  Html: Html,
  build: {
    pages: ["/", "/bidoof", "/404"	],
  },
} satisfies StreamPluginOptions;
```

### vite-plugin-react-server/client

Used in `vite.config.ts` for standard Vite client-side behavior

```ts
import { defineConfig, type Plugin } from "vite";
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: vitePluginReactClient(config),
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
Serves the static directory.

---

### vite-plugin-react-server

Used in `vite.server.config.ts`, this plugin strictly separates client and server execution. The client components will be emitted as references. 

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
NODE_OPTIONS="--conditions=react-server" vite build --config vite.server.config.ts
```
Generates server and static folder. The plugin ensures proper SSR handling without requiring `--ssr` manually.
Note: ssr can still be disabled via config `{ssr:false}`, which will enable vite's browser virtualization

---

## Static Site Generation

Single-out the static generation step by only inluding the static plugin. Expects client and server folders to be there.
```ts
import { defineConfig, Plugin } from "vite";
import { reactStaticPlugin } from "vite-plugin-react-server/static";
import { config } from "./vite.react.config";

export default defineConfig({
  plugins: [reactStaticPlugin(config)],
});
```

Example output structure:

```sh
dist/static/index.html
dist/static/index.rsc
dist/static/about/index.html
dist/static/about/index.rsc
```

The entire `dist/client` directory is copied into `dist/static`, as well as any assets used server-side. Allowing easy deployment by moving the static folder to a hosting service.

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
moduleBaseURL: "https://github.com/my-gh-pages",
```
Defines asset URL resolution for CSS collectors and bootstrapModule.

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
pageExportName: 'Page',
```
Changes the default name "Page"
```ts
propsExportName: 'props',
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

## Contributions

If you want to help develop or maintain the plugin feel free to open a PR or issue on GitHub.