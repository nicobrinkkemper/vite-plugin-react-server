import { describe, it, expect } from 'vitest'
import { resolveUserConfig } from '../../src/options.js'
import { ResolvedUserOptions } from '../../src/types.js'

describe('Build configuration', () => {
  const mockOptions = {
    moduleBase: "src",
    moduleBasePath: "/src",
    moduleBaseURL: "/src",
    Page: "src/page/page.tsx",
    props: "src/page/props.ts",
    build: {
      pages: () => ['/'],
      client: "dist/client",
      server: "dist/server",
    },
    projectRoot: process.cwd(),
    assetsDir: "assets",
    Html: ({children}:{children:any}) => children,
    pageExportName: "page",
    propsExportName: "props",
    collectCss: false,
    collectAssets: false,
  } satisfies ResolvedUserOptions

  it('uses server outDir for server builds', () => {
    const result = resolveUserConfig(
      'react-server',
      [],
      {},
      { command: 'build', isSsrBuild: true, mode: 'production' },
      mockOptions
    )

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.outDir).toBe('dist/server')
    }
  })

  it('uses client outDir for client builds', () => {
    const result = resolveUserConfig(
      'react-client',
      [],
      {},
      { command: 'build', mode: 'production', isSsrBuild: false },
      mockOptions
    )
    if(process.env.NODE_OPTIONS?.match(/--conditions=react-server/)) {
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toBe('Vite was run with the react-server condition, but is making a client build.')
      }
    } else {
      expect(result.type).toBe('success')
      if (result.type === 'success') {
        expect(result.userConfig.build.outDir).toBe('dist/client')
      }
    }
  })
}) 