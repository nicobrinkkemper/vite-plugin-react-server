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
Portable React package for browsers

If the data returned from a prop file or function isn't actually static, then you need to make sure the endpoints are dynamic too.

If the props are static on a route by route basis, the template examples should offer
enough inspiration. Of course there's no real rule for the props or page files and 
you're free to implement any kind of strategy here.## Debugging

The debugging features for React server components are very advanced, but there are some caveats.
Please keep in mind that the dependencies that are used are experimental and may change in the future.

Caveats:
- Detailed stack-traces work for both the client and server plugin's development server
- Stack-traces become even more detailed when the browser's developer console is opened

For example when we go to the demo and visit the error page after using the `npm run start` command
```text
Error

test

TestError@file:///home/bidoof-template/src/page/error-example/page.tsx:1:315
resolveErrorDev@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1368:65
processFullStringRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1783:19
processFullBinaryRow@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1771:29
progress@http://localhost:5173/node_modules/.vite/deps/react-server-dom-esm_client__browser.js?v=ee6397a5:1942:80
```
After opening the developer console and refreshing
```text
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
```text

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

<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1. [Getting Started](./getting-started.md)
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)

2. [Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)

3. [Configuration](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)

4. [CSS Handling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)

5. [Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)

6. [Static Site Generation](./static-site-generation.md)
	- [Static Plugin](./static-site-generation.md#static-plugin)
	- [Build Process](./static-site-generation.md#build-process)
	- [Deployment Strategies](./static-site-generation.md#deployment-strategies)

7. [Build Orchestration](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)

8. [Architecture](./architecture.md)
	- [Design Philosophy](./architecture.md#design-philosophy)
	- [Environment Variables](./architecture.md#environment-variables)
	- [Plugin Composition](./architecture.md#plugin-composition)
	- [HTML Component Support](./architecture.md#html-component-support)

9. [Advanced Topics](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)

10. [API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)

11. [Transformations](./transformations.md)
	 - [Code Transformations](./transformations.md#code-transformations)
	 - [Directive Handling](./transformations.md#directive-handling)
	 - [Build Output Examples](./transformations.md#build-output-examples)

12. [Loader](./loader.md)
	 - [React Server Components Loader](./loader.md#react-server-components-loader)
	 - [Directive Processing](./loader.md#directive-processing)
	 - [Module Boundaries](./loader.md#module-boundaries)
	 - [Custom Registration Functions](./loader.md#custom-registration-functions)

13. [Patch System](./patch-system.md)
	 - [React Version Compatibility](./patch-system.md#react-version-compatibility)
	 - [Creating Patches](./patch-system.md#creating-patches)
	 - [Maintenance Guide](./patch-system.md#maintenance-guide)

14. **[Practical Guide](./practical-guide.md) ← you are here**
	 - [Real-world Examples](./practical-guide.md#real-world-examples)
	 - [Debugging Features](./practical-guide.md#debugging-features)
	 - [Production Implementations](./practical-guide.md#production-implementations)

15. [Troubleshooting Guide](./troubleshooting-guide.md)
	 - [Common Issues](./troubleshooting-guide.md#common-issues)
	 - [Debugging Tips](./troubleshooting-guide.md#debugging-tips)
	 - [Performance Optimization](./troubleshooting-guide.md#performance-optimization)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->