import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'

describe('client build', () => {
  const testDir = resolve(__dirname, '../fixtures/test-project')
  
  beforeAll(() => {
    // Clean up any previous test files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    
    // Ensure directories exist
    mkdirSync(resolve(testDir, 'src/page'), { recursive: true })
    
    // Create index.html with client entry point
    writeFileSync(resolve(testDir, 'index.html'), `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <div id="root"></div>
          <script type="module" src="/src/client.js"></script>
        </body>
      </html>
    `)
    
    // Create client entry
    writeFileSync(resolve(testDir, 'src/client.js'), `
      const root = document.getElementById('root')
      root.textContent = 'Hello from client!'
    `)
  })

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('builds client successfully', async () => {
    await build({
      root: testDir,
      logLevel: 'error',
      build: {
        outDir: 'dist/client'
      },
      mode: 'production',
      configFile: false
    })

    const clientDir = resolve(testDir, 'dist/client')
    expect(existsSync(clientDir)).toBe(true)
    expect(existsSync(resolve(clientDir, 'assets'))).toBe(true)
    expect(existsSync(resolve(clientDir, 'index.html'))).toBe(true)
  })
}) 