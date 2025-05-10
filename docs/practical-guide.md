# Practical Implementation Guide

For complete examples and production implementations:

1. [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official) - Playground example with:
   - GitHub Pages deployment workflow
   - API fetching utilities
   - CSS Modules setup
   - Client-side navigation
   - Error boundary
   - TypeScript configuration

This demo is very simple on purpose. It shows a naive implementation of client-side navigation.
There's nothing that's stopping the user from using ReactRouter or something similar, but this plugin doesn't
assume that you do and neither does this example.

2. [mmcelebration.com](https://github.com/nicobrinkkemper/mmc) - Production implementation with:
   - GitHub Pages deployment workflow
   - Advanced routing patterns
   - Image generation
   - "white-label" front-end using esm modules
   - Type-safe props/page routing

## Plugin Architecture and Naming

The plugin's architecture is based on modern React 19 server architecture, where the terms "client" and "server" refer to the target environment and module system rather than where the code runs. We are able to create three folders using this plugin.

- **Client folder**:
Server side / client boundary

- **Server folder**:
Server side / server boundary

- **Static folder**
Poratable React package for browsers

If the data returned from a prop file or function isn't actually static, then you need to make sure the endpoints are dynamic too.

If the props are static on a route by route basis, the template examples should offer
enough inspiration. Of course there's no real rule for the props or page files and 
you're free to implement any kind of strategy here.


## Debugging

The debugging features for React server components are very advanced, but there are some caveats.
Please keep in mind that the dependencies that are used are experimental and may change in the future.

Caveats:
- Detailed stack-traces work for both the client and server plugin's development server
- Stack-traces become even more detailed when the browser's developer console is opened

For example when we go to the demo and visit the error page after using the `npm run start` command
```sh
Error

test

TestError@file:///home/bidoof-template/src/page/error-example/page.tsx:1:315
resolveErrorDev@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1368:65
processFullStringRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1783:19
processFullBinaryRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1771:29
progress@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1942:80
```
After opening the developer console and refreshing
```sh
Error

test

TestError@file:///home/bidoof-template/src/page/error-example/page.tsx:1:315
resolveErrorDev@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1368:65
processFullStringRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1783:19
processFullBinaryRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1771:29
progress@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1942:80
promise callback*startReadingFromStream@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1965:23
node_modules/react-server-dom-esm/cjs/react-server-dom-esm-client.browser.development.js/exports.createFromFetch/<@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:2093:35
promise callback*node_modules/react-server-dom-esm/cjs/react-server-dom-esm-client.browser.development.js/exports.createFromFetch@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:2091:28
createReactFetcher@http://localhost:5173/src/utils/createReactFetcher.ts:11:22
@http://localhost:5173/src/client.tsx:45:39
```
After navigating back and forth home and error-page:
```sh

Go back
Error

test

TestError@file:///home/bidoof-template/src/page/error-example/page.tsx:1:315
resolveErrorDev@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1368:65
processFullStringRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1783:19
processFullBinaryRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1771:29
progress@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1942:80
promise callback*startReadingFromStream@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1965:23
node_modules/react-server-dom-esm/cjs/react-server-dom-esm-client.browser.development.js/exports.createFromFetch/<@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:2093:35
promise callback*node_modules/react-server-dom-esm/cjs/react-server-dom-esm-client.browser.development.js/exports.createFromFetch@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:2091:28
createReactFetcher@http://localhost:5173/src/utils/createReactFetcher.ts:11:22
Shell/navigate</<@http://localhost:5173/src/client.tsx:18:9
startTransition@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:6417:29
Shell/navigate<@http://localhost:5173/src/client.tsx:16:20
Shell/<@http://localhost:5173/src/client.tsx:26:14
EventListener.handleEvent*useEventListener/<@http://localhost:5173/src/hooks/useEventListener.ts:10:24
react-stack-bottom-frame@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:20279:20
runWithFiberInDEV@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:1076:15
commitHookEffectListMount@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:9475:163
commitHookPassiveMountEffects@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:9529:138
commitPassiveMountOnFiber@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:11626:29
recursivelyTraversePassiveMountEffects@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:11595:61
commitPassiveMountOnFiber@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:11651:51
flushPassiveEffects@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:14309:36
node_modules/react-dom/cjs/react-dom-client.development.js/commitRoot/<@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:13797:34
performWorkUntilDeadline@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:33:58
EventHandlerNonNull*node_modules/scheduler/cjs/scheduler.development.js/<@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:152:9
node_modules/scheduler/cjs/scheduler.development.js@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:263:7
__require@http://localhost:5173/node_modules/.vite/deps/chunk-QUSIKYTG.js?v=2cd1acd7:3:50
node_modules/scheduler/index.js@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:274:24
__require@http://localhost:5173/node_modules/.vite/deps/chunk-QUSIKYTG.js?v=2cd1acd7:3:50
node_modules/react-dom/cjs/react-dom-client.development.js/<@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:18963:23
node_modules/react-dom/cjs/react-dom-client.development.js@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:22079:7
__require@http://localhost:5173/node_modules/.vite/deps/chunk-QUSIKYTG.js?v=2cd1acd7:3:50
node_modules/react-dom/client.js@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:22090:24
__require@http://localhost:5173/node_modules/.vite/deps/chunk-QUSIKYTG.js?v=2cd1acd7:3:50
@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=38337cc5:22094:16
```

As you can see the stack-traces become a lot more detailed once the developer console is open.


