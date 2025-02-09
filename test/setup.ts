import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export async function setupTestProject(testDir: string) {
  // Ensure directories exist
  mkdirSync(resolve(testDir, 'src'), { recursive: true });
  mkdirSync(resolve(testDir, 'src/page'), { recursive: true });

  // Create test files
  writeFileSync(resolve(testDir, 'src/client.tsx'), `"use client"
  import React from 'react'
  export default function Client() {
    return React.createElement('div', null, 'Client')
  }
  `);

  writeFileSync(resolve(testDir, 'src/server.tsx'), `"use server"
  import React from 'react'
  export function TestServerAction() {
    return React.createElement('div', null, 'Server')
  }
  `);

  writeFileSync(resolve(testDir, 'src/page/page.tsx'), `
  import React from 'react'
  export function Page() {
    return React.createElement('div', null, 'Page')
  }
  `);

  writeFileSync(resolve(testDir, 'src/page/props.ts'), `
  export const props = ()=>({
    title: 'Test'
  })
  `);

  writeFileSync(resolve(testDir, 'index.html'), `<!DOCTYPE html>
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
  `);
  
} 