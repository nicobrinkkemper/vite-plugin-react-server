import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

export function setupTestProject(testDir: string) {
  console.log('Setting up test project in:', testDir)
  // Clean up any previous test files
  rmSync(testDir, { recursive: true, force: true })
  
  // Ensure directories exist
  mkdirSync(resolve(testDir, 'src/page'), { recursive: true })
  
  // Create test files
  writeFileSync(resolve(testDir, 'index.html'), `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test App</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/src/client.tsx"></script>
      </body>
    </html>
  `)

  writeFileSync(resolve(testDir, 'src/client.tsx'), `
    import React from 'react'
    export default function Client() {
      return <div>Client</div>
    }
  `)
  
  writeFileSync(resolve(testDir, 'src/page/page.tsx'), `
    import React from 'react'
    export function Page() {
      return <div>Page</div>
    }
  `)
  
  writeFileSync(resolve(testDir, 'src/page/props.ts'), `
    export const props = {
      title: 'Test'
    }
  `)
}

export function cleanupTestProject(testDir: string) {
  rmSync(testDir, { recursive: true, force: true })
} 