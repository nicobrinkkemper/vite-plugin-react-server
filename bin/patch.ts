#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const PATCH_RECONCILER_VERSION = '19.1.0-experimental-b3a95caf-20250113'

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

    // Get our patch file
    const ourPatchPath = path.resolve(__dirname, '../patches/react-server-dom-esm+0.0.0-experimental-b3a95caf-20250113.patch')
    let patchContent = await fs.readFile(ourPatchPath, 'utf-8')

    // Replace version strings to match installed React
    patchContent = patchContent.replace(
      new RegExp(PATCH_RECONCILER_VERSION, 'g'),
      installedVersion
    )

    // Create patches dir in user's project
    const userPatchesDir = path.resolve(process.cwd(), 'patches')
    await fs.mkdir(userPatchesDir, { recursive: true })

    // Write the patch file
    const newFileName = `react-server-dom-esm+${installedVersion}.patch`
    const newPatchPath = path.resolve(userPatchesDir, newFileName)
    await fs.writeFile(newPatchPath, patchContent)

    console.log(`
✅ Created patch file for React Server DOM ESM
   Location: patches/${newFileName}

Next steps:
1. Install patch-package:
   npm install patch-package --save-dev

2. Add to package.json:
   "postinstall": "patch-package"

3. Run:
   npm install

The patch will be applied automatically on install.
`)
    return true
  } catch (e) {
    console.error('Failed to create patch:', e)
    process.exit(1)
  }
}

patchReactExperimental().catch((e) => {
  console.error('Unexpected error:', e)
  process.exit(1)
}) 