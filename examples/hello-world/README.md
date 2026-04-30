# hello-world

Smallest runnable `vite-plugin-react-server` app. The point: prove the plugin works end-to-end with the bare minimum a browser-rendered RSC page actually needs (which is more than the README's snippet shows).

## What's here

```
examples/hello-world/
├── index.html        # Vite entry; mounts /src/client.tsx into #root
├── vite.config.ts    # plugin config + optimizeDeps for the browser RSC client
├── package.json      # file:../.. linked, no global tools required
├── tsconfig.json
└── src/
    ├── page.tsx      # 'Page' export — server component
    └── client.tsx    # createReactFetcher + useRscHmr
```

Total source: under 50 lines across `src/` + `vite.config.ts` + `index.html`.

## Run it

```bash
cd examples/hello-world
npm install
npx vite
```

Open the URL Vite prints. You should see "Hello world".

## What this proves

The plugin's README "Minimal Example" snippet (one `vite.config.ts`, one `page.tsx`) doesn't actually run a browser app on its own. A working RSC dev app additionally needs:

- `index.html` mounting `/src/client.tsx` into `#root`
- `src/client.tsx` using `createReactFetcher` + `useRscHmr`
- `src/props.ts` (a function that runs per-request)
- `optimizeDeps.include` for `react-server-dom-esm/client.browser`

This example is the smallest config that ships all four. Use it as a reference when porting docs snippets into a real app.

## Build

This example focuses on dev. For production-build flags see [docs/getting-started.md](../../docs/getting-started.md) and the larger [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official).
