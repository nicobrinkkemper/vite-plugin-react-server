#!/usr/bin/env node
import fs from 'node:fs/promises'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url';
import React from 'react';
import packageJSON from '../package.json' with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));  

// Hardcoded template version from our last successful patch
const TEMPLATE_VERSION = "0.0.0-experimental-0ca8420f-20250504";
const templateVersionSuffix = TEMPLATE_VERSION.split("-experimental-")[1];

// Get installed version
const installedVersion = React.version;
const installedVersionSuffix = installedVersion.split("-experimental-")[1]

// Get peer dependency versions
const peerReactVersion = packageJSON.peerDependencies.react.replace("^", "");
const peerReactESMVersion = packageJSON.peerDependencies["react-server-dom-esm"].replace("^", "");
console.log('Template version:', TEMPLATE_VERSION);
console.log('Installed version:', installedVersion);
console.log('Peer version:', peerReactVersion);
console.log('ESM version (for final patch):', peerReactESMVersion);

async function patchReactExperimental() {
  try {
    if (templateVersionSuffix === installedVersionSuffix) {
      console.log("React version is already patched", TEMPLATE_VERSION, installedVersion);
      return;
    }

    // Define patches to process
    const patches = [
      {
        // The template patch file uses our experimental version
        template: `../scripts/react-server-dom-esm+${TEMPLATE_VERSION}.patch`,
        // But the final patch file uses the ESM version
        output: `react-server-dom-esm+${peerReactESMVersion}.patch`
      },
    ]

    // Create patches dir in user's project
    const userPatchesDir = path.resolve(process.cwd(), 'patches')
    await fs.mkdir(userPatchesDir, { recursive: true })

    // Process each patch
    for (const {template, output} of patches) {
      const patchPath = path.resolve(__dirname, template)
      let patchContent = await fs.readFile(patchPath, 'utf-8')

      // Replace version strings
      patchContent = patchContent.replace(
        new RegExp(templateVersionSuffix, 'g'),
        installedVersionSuffix
      )

      // Write the patch file
      const newPatchPath = path.resolve(userPatchesDir, output)
      await fs.writeFile(newPatchPath, patchContent)
      console.log(`Created patch file: patches/${output}`)
    }

    console.log(`
✅ Created patch files for React packages for version ${installedVersion}
   Location: patches/

Next steps:
1. Install patch-package:
   npm install patch-package --save-dev

2. Add to package.json:
   "postinstall": "patch-package"

3. Run:
   npm install

The patches will be applied automatically on install.
`)
    return true
  } catch (e) {
    console.error('Failed to create patches:', e)
    process.exit(1)
  }
}

patchReactExperimental().catch((e) => {
  console.error('Unexpected error:', e)
  process.exit(1)
}) 