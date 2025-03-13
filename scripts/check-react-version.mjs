#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEMPLATE_VERSION = '0.0.0-experimental-eda36a1c-20250228'
const STUB_VERSION = '0.0.1'

async function main() {
    // Read installed React version
    const patchVersion = React.version
    const PATCH_RECONCILER_VERSION = patchVersion.replace('19.1.0', '0.0.0')
    if(TEMPLATE_VERSION === PATCH_RECONCILER_VERSION) {
        console.log('React version is already patched')
        return;
    } 
    
    // Define patches to process
    const patches = [
      {
        template: path.resolve(__dirname, `react-server-dom-esm+${TEMPLATE_VERSION}.patch`),
        output: `react-server-dom-esm+${STUB_VERSION}.patch`
      },
    ]

    // Create patches dir
    const userPatchesDir = path.resolve(process.cwd(), 'patches')
    await fs.mkdir(userPatchesDir, { recursive: true })

    // Process each patch
    for (const {template, output} of patches) {
      let patchContent = await fs.readFile(template, 'utf-8')
      // Write patched file
      const outputPath = path.resolve(userPatchesDir, output)
      await fs.writeFile(outputPath, patchContent)
      console.log(`Wrote patch file to ${outputPath}`)
    }
}

try {
  main()   
} catch (error) {
  console.error('error applying patch', error)
}