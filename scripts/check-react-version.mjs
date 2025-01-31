#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PATCH_RECONCILER_VERSION = '19.1.0-experimental-b3a95caf-20250113'
const ALTERNATIVE_REACT_VERSION = '0.0.0-experimental-b3a95caf-20250113'
const STUB_ESM_VERSION = `0.0.1`
const PATCH_FILE = `react-server-dom-esm+${STUB_ESM_VERSION}.patch`

async function main() {
  try {
    // Read installed React version
    const reactPkgPath = path.resolve(process.cwd(), 'node_modules/react/package.json')
    const reactPkg = JSON.parse(await fs.readFile(reactPkgPath, 'utf-8'))
    const installedVersion = reactPkg.version

    // Get our patch file from our package
    const ourPatchPath = path.resolve(__dirname, `../patches/${PATCH_FILE}`)
    let patchContent = await fs.readFile(ourPatchPath, 'utf-8')

    // Replace the version in the patch content
    patchContent = patchContent.replace(
      new RegExp(PATCH_RECONCILER_VERSION, 'g'),
      installedVersion
    ).replace(
      new RegExp(ALTERNATIVE_REACT_VERSION, 'g'),
      installedVersion
    )

    // Create patches dir in user's project
    const userPatchesDir = path.resolve(process.cwd(), 'patches')
    await fs.mkdir(userPatchesDir, { recursive: true })

    // Write the patch file - use stub version for filename
    const newFileName = `react-server-dom-esm+${STUB_ESM_VERSION}.patch`
    const newPatchPath = path.resolve(userPatchesDir, newFileName)
    await fs.writeFile(newPatchPath, patchContent)

    console.log(`Updated patch for React ${installedVersion}`)
  } catch (error) {
    
  }
}

main() 