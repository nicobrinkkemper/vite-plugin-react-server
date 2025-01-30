import { beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

// Create test project structure
beforeAll(async () => {
  const testDir = resolve(__dirname, 'fixtures/test-project')
  
  // Create all required directories
  await mkdir(resolve(testDir, 'src/page'), { recursive: true })
  
  // Create client component
  await writeFile(resolve(testDir, 'src/client.tsx'), `
    "use client"
    import React from 'react'
    export function Client() { 
      return <div>Client Component</div> 
    }
  `)
  
  // Create server component that uses client component
  await writeFile(resolve(testDir, 'src/page/page.tsx'), `
    import React from 'react'
    import { Client } from '../client.js'
    
    export function Page() { 
      return (
        <div>
          Server Page with client component:
          <Client />
        </div>
      )
    }
  `)

  await writeFile(resolve(testDir, 'src/page/props.ts'), `
    export const props = {
      message: "Hello from test app!"
    }
  `)

  await writeFile(resolve(testDir, 'index.html'), `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Test App</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/src/client.tsx"></script>
      </body>
    </html>
  `)

  await writeFile(resolve(testDir, 'package.json'), JSON.stringify({
    "name": "test-project",
    "type": "module",
    "dependencies": {
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "react-server-dom-esm": "^0.0.1"
    }
  }, null, 2))
}) 