# Examples

## Static Site (GitHub Pages)

Minimal config for a static site deployed to GitHub Pages:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  base: "/my-repo/",
  plugins: vitePluginReactServer({
    moduleBase: "src",
    moduleBaseURL: "/my-repo/",
    Page: (url) => `src/pages${url}page.tsx`,
    props: (url) => `src/pages${url}props.ts`,
    Html: "src/Html.tsx",
    build: { pages: ["/", "/about/"] },
  }),
});
```

Build and deploy `dist/static/`.

**Live examples:**
- [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official) — starter template
- [mmc](https://github.com/nicobrinkkemper/mmc) — 284 pages

## Dynamic Server (Express)

Use the build output as ESM modules in an Express server:

```ts
// server.ts
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Static pages (pre-rendered)
app.use(express.static(join(__dirname, "dist/static")));

// RSC endpoint
app.get("*.rsc", (req, res) => {
  res.setHeader("Content-Type", "text/x-component");
  res.sendFile(join(__dirname, "dist/static", req.path));
});

// Dynamic route — render on request using server modules
app.get("/user/:id", async (req, res) => {
  const { Page } = await import("./dist/server/pages/user/page.js");
  const props = { userId: req.params.id };
  // Use createRscStream / createHtmlStream to render
  // ...
});

app.listen(3000);
```

## Server Actions

```ts
// src/actions/submit.server.ts
"use server";

export async function submitForm(data: FormData) {
  const name = data.get("name") as string;
  // Save to database, send email, etc.
  return { success: true, name };
}
```

```tsx
// src/pages/contact/page.tsx
import { submitForm } from "../../actions/submit.server.js";

export const Page = () => (
  <form action={submitForm}>
    <input name="name" required />
    <button type="submit">Submit</button>
  </form>
);
```

## Routing

vprs ships a file-based router — `routes: { dir: "routes" }`, and the file tree is
the URL tree, with dynamic params, per-segment loaders, nested layouts and
client-side `Link` navigation. It has its own page: **[Routing](./routing.md)**.

It stays optional. Without `routes`, map URLs to files yourself with `Page` and
bring your own client router (React Router, TanStack Router, or none):

```ts
// Single page
Page: "src/page.tsx",

// Your own mapping
Page: (url) => {
  const routes: Record<string, string> = {
    "/": "src/home.tsx",
    "/about/": "src/about.tsx",
  };
  return routes[url] || "src/404.tsx";
},
```

## React in Config (Server-First)

With `react-server` condition, you can use JSX directly in your Vite config:

```tsx
// vite.react.config.tsx
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { Css } from "vite-plugin-react-server/components";

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: "src/page.tsx",
    components: {
      Html: ({ Root, cssFiles, globalCss, pageProps, Page }) => (
        <html>
          <head><Css cssFiles={globalCss} /></head>
          <body>
            <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
          </body>
        </html>
      ),
    },
    build: { pages: ["/"] },
  }),
});
```

## Custom HTML Shell

```tsx
// src/Html.tsx
import { Css } from "vite-plugin-react-server/components";
import type { HtmlProps } from "vite-plugin-react-server/types";

export const Html = ({ Root, cssFiles, globalCss, pageProps = { title: "My App" }, Page }: HtmlProps) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <Css cssFiles={globalCss} />
      <title>{pageProps.title}</title>
    </head>
    <body>
      <Root as="main" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
    </body>
  </html>
);
```

## Custom Root Component

```tsx
// src/Root.tsx
import React from "react";
import { Css } from "vite-plugin-react-server/components";

export const Root = ({ Page, pageProps = {}, as: As = React.Fragment, cssFiles, ...props }) => {
  if (As === React.Fragment) {
    return <><Page {...pageProps} /></>;
  }
  return (
    <As {...props} role="main">
      <Page {...pageProps} />
      <Css cssFiles={cssFiles} />
    </As>
  );
};
```
