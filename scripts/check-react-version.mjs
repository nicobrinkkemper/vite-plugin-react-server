#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PATCH_RECONCILER_VERSION = '19.1.0-experimental-b3a95caf-20250113'
const REAL_ESM_VERSION = '0.0.0-experimental-b3a95caf-20250113'
const STUB_ESM_VERSION = `0.0.1`
const GENERATED_PATCH_FILE = `react-server-dom-esm+${STUB_ESM_VERSION}.patch`
const TEMPLATE_PATCH_FILE = `react-server-dom-esm+${REAL_ESM_VERSION}.patch`

async function main() {
    // Read installed React version
    const reactPkgPath = path.resolve(process.cwd(), 'node_modules/react/package.json')
    const reactPkg = JSON.parse(await fs.readFile(reactPkgPath, 'utf-8'))
    const installedVersion = reactPkg.version

    // Get our patch file from our package
    const ourPatchPath = path.resolve(__dirname, TEMPLATE_PATCH_FILE)
    let patchContent = await fs.readFile(ourPatchPath, 'utf-8')

    // Replace the version in the patch content
    patchContent = patchContent.replace(
      new RegExp(PATCH_RECONCILER_VERSION, 'g'),
      installedVersion
    ).replace(
      new RegExp(REAL_ESM_VERSION, 'g'),
      installedVersion
    )

    // Create patches dir in user's project
    const userPatchesDir = path.resolve(process.cwd(), 'patches')
    await fs.mkdir(userPatchesDir, { recursive: true })

    // Write the patch file - use stub version for filename
    const newPatchPath = path.resolve(userPatchesDir, GENERATED_PATCH_FILE)
    await fs.writeFile(newPatchPath, patchContent)
    console.log(`Wrote patch file to ${newPatchPath}`)

    console.log(`Updated patch to match React version ${installedVersion}`)

}

const PATCH = ``

try {
main()   
} catch (error) {
  console.error('error applying patch', error)
}