# Patches System Guide

This guide explains how to set up and maintain the patches system for the vite-react-stream plugin, particularly for React version compatibility.

## Overview

The patches system allows us to maintain compatibility with different React versions by applying specific modifications to React's server components implementation. This is crucial for ensuring the plugin works correctly with React's experimental features.

Indicators of mismatching version is when errors arise regarding the "rules of hooks" during the static build. Since the static build runs in production mode by default, this error message is omitted. To see the error, you should make a development build. 

```json
    "debug-build": "NODE_ENV=development npm run build:client -- --mode development && NODE_ENV=development npm run build:server -- --mode development",
```
Above command would run the build and show you any errors+stacktraces that occur.

Beware, development builds actually change the emitted files to development versions. For example, the index.rsc files will contain information about the user's local machine.

## Setting Up for plugin maintainers

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

This will remove any previous patches, do a clean install of the react dependencies. It does this to ensure that the experimental version number is the same as installing a clean @experimental react version. 

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

We did a second clean install of the react depedencies to apply a newly created patch file based on the installed version number. Before we apply these patch files, we make sure to replace the version string to the React version we have installed.

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
