# Patches System Guide

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

4. [Component Resolution](./component-resolution.md)
	- [Path-based vs Direct Components](./component-resolution.md#path-based-vs-direct-components)
	- [When to Use Each Approach](./component-resolution.md#when-to-use-each-approach)
	- [Migration Guide](./component-resolution.md#migration-guide)

5. [CSS Handling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)

6. [Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)

7. [Static Site Generation](./static-site-generation.md)
	- [Static Plugin](./static-site-generation.md#static-plugin)
	- [Build Process](./static-site-generation.md#build-process)
	- [Deployment Strategies](./static-site-generation.md#deployment-strategies)

8. [Build Orchestration](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)

9. [Architecture](./architecture.md)
	- [Design Philosophy](./architecture.md#design-philosophy)
	- [Environment Variables](./architecture.md#environment-variables)
	- [Plugin Composition](./architecture.md#plugin-composition)
	- [HTML Component Support](./architecture.md#html-component-support)

10. [Advanced Topics](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)

11. [API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)

12. [Transformations](./transformations.md)
	 - [Code Transformations](./transformations.md#code-transformations)
	 - [Directive Handling](./transformations.md#directive-handling)
	 - [Build Output Examples](./transformations.md#build-output-examples)

13. [Loader](./loader.md)
	 - [React Server Components Loader](./loader.md#react-server-components-loader)
	 - [Directive Processing](./loader.md#directive-processing)
	 - [Module Boundaries](./loader.md#module-boundaries)
	 - [Custom Registration Functions](./loader.md#custom-registration-functions)

14. **[Patch System](./patch-system.md) ← you are here**
	 - [React Version Compatibility](./patch-system.md#react-version-compatibility)
	 - [Creating Patches](./patch-system.md#creating-patches)
	 - [Maintenance Guide](./patch-system.md#maintenance-guide)

15. [Practical Guide](./practical-guide.md)
	 - [Real-world Examples](./practical-guide.md#real-world-examples)
	 - [Debugging Features](./practical-guide.md#debugging-features)
	 - [Production Implementations](./practical-guide.md#production-implementations)

16. [Troubleshooting Guide](./troubleshooting-guide.md)
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


<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1. [Getting Started](./getting-started.md)
   - Installation and Setup
   - Basic Configuration
   - Example Projects

2. [Core Concepts](./core-concepts.md)
   - Client-Server Separation
   - React Server Components
   - Plugin Architecture

3. [Configuration](./configuration.md)
   - Plugin Options
   - Routing Configuration
   - Build Configuration

4. [CSS Handling](./css-handling.md)
   - CSS Collectors
   - Inline CSS
   - Custom CSS Processing

5. [Server Actions](./server-actions.md)
   - Creating Server Actions
   - Client Integration
   - Error Handling
   - Database Integration

6. [Static Site Generation](./static-site-generation.md)
   - Static Plugin
   - Build Process
   - Deployment Strategies

7. [Build Orchestration](./build-orchestration.md)
   - Multiple Build Targets
   - Plugin Architecture
   - Environment-Specific Builds

8. [Architecture](./architecture.md)
   - Design Philosophy
   - Environment Variables
   - Plugin Composition
   - HTML Component Support

9. [Advanced Topics](./advanced-topics.md)
   - Custom Workers
   - Message System
   - Extending the Plugin

10. [API Reference](./api-reference.md)
   - Plugin Options
   - Component Props
   - Worker Messages
    - Type Definitions

11. [Transformations](./transformations.md)
    - Code Transformations
    - Directive Handling
    - Build Output Examples

12. [Loader](./loader.md)
    - React Server Components Loader
    - Directive Processing
    - Module Boundaries
    - Custom Registration Functions

13. [Patch System](./patch-system.md)
    - React Version Compatibility
    - Creating Patches
    - Maintenance Guide

14. [Practical Guide](./practical-guide.md)
    - Real-world Examples
    - Debugging Features
    - Production Implementations

15. [Troubleshooting Guide](./troubleshooting-guide.md)
    - Common Issues
    - Debugging Tips
    - Performance Optimization

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->

<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1. [Getting Started](./getting-started.md)
   - Installation and Setup
   - Basic Configuration
   - Example Projects

2. [Core Concepts](./core-concepts.md)
   - Client-Server Separation
   - React Server Components
   - Plugin Architecture

3. [Configuration](./configuration.md)
   - Plugin Options
   - Routing Configuration
   - Build Configuration

4. [CSS Handling](./css-handling.md)
   - CSS Collectors
   - Inline CSS
   - Custom CSS Processing

5. [Server Actions](./server-actions.md)
   - Creating Server Actions
   - Client Integration
   - Error Handling
   - Database Integration

6. [Static Site Generation](./static-site-generation.md)
   - Static Plugin
   - Build Process
   - Deployment Strategies

7. [Build Orchestration](./build-orchestration.md)
   - Multiple Build Targets
   - Plugin Architecture
   - Environment-Specific Builds

8. [Architecture](./architecture.md)
   - Design Philosophy
   - Environment Variables
   - Plugin Composition
   - HTML Component Support

9. [Advanced Topics](./advanced-topics.md)
   - Custom Workers
   - Message System
   - Extending the Plugin

10. [API Reference](./api-reference.md)
   - Plugin Options
   - Component Props
   - Worker Messages
    - Type Definitions

11. [Transformations](./transformations.md)
    - Code Transformations
    - Directive Handling
    - Build Output Examples

12. [Loader](./loader.md)
    - React Server Components Loader
    - Directive Processing
    - Module Boundaries
    - Custom Registration Functions

13. [Patch System](./patch-system.md)
    - React Version Compatibility
    - Creating Patches
    - Maintenance Guide

14. [Practical Guide](./practical-guide.md)
    - Real-world Examples
    - Debugging Features
    - Production Implementations

15. [Troubleshooting Guide](./troubleshooting-guide.md)
    - Common Issues
    - Debugging Tips
    - Performance Optimization

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->



This guide explains how to set up and maintain the patches system for the vite-react-stream plugin, particularly for React version compatibility.

## Overview

The patches system allows us to maintain compatibility with different React versions by applying specific modifications to React's server components implementation. This is crucial for ensuring the plugin works correctly with React's experimental features.

Indicators of mismatching version is when errors arise regarding the "rules of hooks" during the static build. Since the static build runs in production mode by default, this error message is omitted. To see the error, you should make a development build. 

```json
    "debug-build": "NODE_ENV=development npm run build:client -- --mode development && NODE_ENV=development npm run build:server -- --mode development",
```
Above command would run the build and show you any errors+stacktraces that occur.

Beware, development builds actually change the emitted files to development versions. For example, the index.rsc files will contain information about the user's local machine.

## Setting up for plugin maintainers

1. Clone the repository:
```bash
git clone https://github.com/your-org/vite-react-stream.git
cd vite-react-stream
```

2. Install dependencies:
```bash
npm install
```

## Creating React Patches

Download the official React repository and make sure you use `yarn` for this repository. If you do not have `yarn` installed, you can run `corepack enable`. Run `yarn build` and once completed succesfully, you can go ahead and copy the files in `build/oss-experimental` to the root of the plugin's repository (see .gitignore).

Check the version number and replace in both `bin/patch.mjs` and `scripts/check-react-version.mjs` the following line:
```typescript
const TEMPLATE_VERSION = "0.0.0-experimental-0ff1d13b-20250507";
```
to be like your oss-experimental build.


From this point on, the `package.json` will show you what the below command will do.

First let's run
```bash
npm run experimental:setup
```

This will remove any previous patches, do a clean install of the React dependencies. It does this to ensure that the experimental version number is the same as installing a clean @experimental react version. 

Example output:
```bash
> vite-plugin-react-server@1.2.0 experimental:setup
> rm -rf patches/* && npm run experimental:clean-install && npm run experimental:copy && npm run experimental:patch && npm run experimental:move-patches

> vite-plugin-react-server@1.2.0 experimental:clean-install
> npm install react-server-dom-esm react@experimental react-dom@experimental && npm install react-server-dom-esm

> vite-plugin-react-server@1.2.0 experimental:copy
> cp -r ./oss-experimental/* ./node_modules/

> vite-plugin-react-server@1.2.0 experimental:patch
> npx patch-package react-server-dom-esm react react-dom --exclude 'nothing'

patch-package 8.0.0
• Creating temporary folder
• Installing react-server-dom-esm@0.0.0-experimental-0ff1d13b-20250507 with npm
• Diffing your files with clean files
✔ Created file patches/react-server-dom-esm+0.0.0-experimental-0ff1d13b-20250507.patch

• Creating temporary folder
• Installing react@0.0.0-experimental-0ff1d13b-20250507 with npm
• Diffing your files with clean files
✔ Created file patches/react+0.0.0-experimental-0ff1d13b-20250507.patch

• Creating temporary folder
• Installing react-dom@0.0.0-experimental-0ff1d13b-20250507 with npm
• Diffing your files with clean files
✔ Created file patches/react-dom+0.0.0-experimental-0ff1d13b-20250507.patch

> vite-plugin-react-server@1.2.0 experimental:move-patches
> mv patches/* ./scripts/
```

We copy our oss-experimental version over the others and create a patch based on the changes. We move these patch files to the scripts folder immediately because they aren't ready yet. We just want `react-server-dom-esm` to work with whatever version is installed. We will do that in step 2.

2. Run the version check script:
```bash
npm run experimental:patch-react
```

Example output:
```bash
> vite-plugin-react-server@1.2.0 experimental:patch-react
> npm run experimental:clean-install && node scripts/check-react-version.mjs && node bin/patch.mjs

> vite-plugin-react-server@1.2.0 experimental:clean-install
> npm install react-server-dom-esm react@experimental react-dom@experimental && npm install react-server-dom-esm

Template version: 0.0.0-experimental-0ff1d13b-20250507
Installed version: 19.2.0-experimental-f7396427-20250501
Peer version: 0.0.0-experimental-f7396427-20250501
ESM version (for final patch): 0.0.1
Wrote patch file to patches/react-server-dom-esm+0.0.1.patch

✅ Created patch files for React packages for version 19.2.0-experimental-f7396427-20250501
   Location: patches/

Next steps:
1. Install patch-package:
   npm install patch-package --save-dev

2. Add to package.json:
   "postinstall": "patch-package"

3. Run:
   npm install

The patches will be applied automatically on install.
```

3. Finally, apply the patches:
```bash
npm run postinstall
```

Example output:
```bash
> vite-plugin-react-server@1.2.0 postinstall
> patch-package

patch-package 8.0.0
Applying patches...
react-server-dom-esm@0.0.1 ✔
```

We did a second clean install of the React depedencies to apply a newly created patch file based on the installed version number. Before we apply these patch files, we make sure to replace the version string to the React version we have installed.

The scripts folder will contain the actual patches that plugin users will get when they run the `patch` command. While it's possible to also patch `react` and `react-dom`, you have to add these to array in the `bin/patch.mjs` file yourself.


## Maintaining Patches

1. When React releases a new version:
   - Update the version in `package.json`
   - Run the version check script
   - Review and test the generated patch

2. Testing patches:
   - Use the test suite: `npm test`
   - Test with example applications
   - Verify client/server component behavior

3. Testing integration
   - Download offical demo repository
   - Link the plugin using `npm link`
   - Use linked version in template repo `npm link vite-plugin-react-stream`
   - Run the patch `npm install && npm run patch-oss` 
   - Run the build `npm run build`


<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1. [Getting Started](./getting-started.md)
   - Installation and Setup
   - Basic Configuration
   - Example Projects

2. [Core Concepts](./core-concepts.md)
   - Client-Server Separation
   - React Server Components
   - Plugin Architecture

3. [Configuration](./configuration.md)
   - Plugin Options
   - Routing Configuration
   - Build Configuration

4. [CSS Handling](./css-handling.md)
   - CSS Collectors
   - Inline CSS
   - Custom CSS Processing

5. [Server Actions](./server-actions.md)
   - Creating Server Actions
   - Client Integration
   - Error Handling
   - Database Integration

6. [Static Site Generation](./static-site-generation.md)
   - Static Plugin
   - Build Process
   - Deployment Strategies

7. [Build Orchestration](./build-orchestration.md)
   - Multiple Build Targets
   - Plugin Architecture
   - Environment-Specific Builds

8. [Architecture](./architecture.md)
   - Design Philosophy
   - Environment Variables
   - Plugin Composition
   - HTML Component Support

9. [Advanced Topics](./advanced-topics.md)
   - Custom Workers
   - Message System
   - Extending the Plugin

10. [API Reference](./api-reference.md)
   - Plugin Options
   - Component Props
   - Worker Messages
    - Type Definitions

11. [Transformations](./transformations.md)
    - Code Transformations
    - Directive Handling
    - Build Output Examples

12. [Loader](./loader.md)
    - React Server Components Loader
    - Directive Processing
    - Module Boundaries
    - Custom Registration Functions

13. [Patch System](./patch-system.md)
    - React Version Compatibility
    - Creating Patches
    - Maintenance Guide

14. [Practical Guide](./practical-guide.md)
    - Real-world Examples
    - Debugging Features
    - Production Implementations

15. [Troubleshooting Guide](./troubleshooting-guide.md)
    - Common Issues
    - Debugging Tips
    - Performance Optimization

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->