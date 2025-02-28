#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEMPLATE_VERSION = '0.0.0-experimental-b3a95caf-20250113'
const ACTUAL_TEMPLATE_VERSION = '19.1.0-experimental-b3a95caf-20250113'
const TARGET_VERSION = '0.0.0-experimental-d55cc79b-20250228'
const ACTUAL_TARGET_VERSION = '19.1.0-experimental-d55cc79b-20250228'
const STUB_VERSION = '0.0.1'

async function main() {
    // Read installed React version
    const reactPkgPath = path.resolve(process.cwd(), 'node_modules/react/package.json')
    const reactPkg = JSON.parse(await fs.readFile(reactPkgPath, 'utf-8'))
    const userPkg = JSON.parse(await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf-8'))
    const patchVersion = React.version
    
    let userVersion = userPkg.dependencies?.react ?? userPkg.devDependencies?.react ?? userPkg.peerDependencies?.react
    if(!userVersion) {
        throw new Error('React version not found in package.json')
    } else {
      userVersion = userVersion.replace('^', '')
    }
    if(userVersion !== TARGET_VERSION) {
      throw new Error(`React patch was made for version ${ACTUAL_TARGET_VERSION}, but you installed version ${userVersion}`)
    }
    // Define patches to process
    const patches = [
      {
        template: path.resolve(__dirname, `react-server-dom-esm+${TEMPLATE_VERSION}.patch`),
        output: `react-server-dom-esm+${STUB_VERSION}.patch`
      },
      {
        template: path.resolve(__dirname, `react+${TEMPLATE_VERSION}.patch`),
        output: `react+${userVersion}.patch`
      },
      {
        template: path.resolve(__dirname, `react-dom+${TEMPLATE_VERSION}.patch`),
        output: `react-dom+${userVersion}.patch`
      }
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

    console.log(`React version check result: 
      userVersion: ${userVersion}
      patchVersion: ${patchVersion}
      ACTUAL_TARGET_VERSION: ${ACTUAL_TARGET_VERSION}
      ACTUAL_TEMPLATE_VERSION: ${ACTUAL_TEMPLATE_VERSION}
      TARGET_VERSION: ${TARGET_VERSION}
      TEMPLATE_VERSION: ${TEMPLATE_VERSION}
`)
}

const PATCH = ``

try {
main()   
} catch (error) {
  console.error('error applying patch', error)
}