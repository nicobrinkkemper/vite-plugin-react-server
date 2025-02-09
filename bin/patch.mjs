#!/usr/bin/env node
import fs from 'node:fs/promises'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url';

const PATCH_RECONCILER_VERSION = '19.1.0-canary-8759c5c8-20250207'
const STUB_VERSION = '0.0.1'
const __dirname = dirname(fileURLToPath(import.meta.url));  

async function patchReactExperimental() {
  try {
    // Read installed React version from user's project
    const reactPkg = JSON.parse(
      await fs.readFile(
        path.resolve(process.cwd(), 'node_modules/react/package.json'),
        'utf-8'
      )
    )
    const installedVersion = reactPkg.version

    // Define patches to process
    const patches = [
      {
        template: '../scripts/react-server-dom-esm+0.0.0-canary-8759c5c8-20250207.patch',
        output: `react-server-dom-esm+${STUB_VERSION}.patch`
      },
      {
        template: '../scripts/react+0.0.0-canary-8759c5c8-20250207.patch',
        output: `react+${installedVersion}.patch`
      },
      {
        template: '../scripts/react-dom+0.0.0-canary-8759c5c8-20250207.patch',
        output: `react-dom+${installedVersion}.patch`
      }
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
        new RegExp(PATCH_RECONCILER_VERSION, 'g'),
        installedVersion
      )

      // Write the patch file
      const newPatchPath = path.resolve(userPatchesDir, output)
      await fs.writeFile(newPatchPath, patchContent)
      console.log(`Created patch file: patches/${output}`)
    }

    console.log(`
✅ Created patch files for React packages
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