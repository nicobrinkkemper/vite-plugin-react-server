import { describe, it, expect } from 'vitest'
import { resolveUserConfig } from '../../src/options.js'
import { ResolvedUserOptions } from '../../src/types.js'

describe('SSR configuration', () => {
  const mockOptions = {
    moduleBase: "src",
    moduleBasePath: "/src",
    moduleBaseURL: "/src",
    Html: ({ children }) => children,
    pageExportName: "Page",
    propsExportName: "props",
    Page: "src/page/page.tsx",
    props: "src/page/props.ts",
    build: {
      pages: () => ['/'],
      client: "dist/client",
      server: "dist/server",
    },
    projectRoot: process.cwd(),
    assetsDir: "assets",
    collectCss: true,
    collectAssets: true
  } satisfies ResolvedUserOptions

  it('sets ssr=true for react-server condition', () => {
    const result = resolveUserConfig(
      'react-server',
      [],
      {},
      { command: 'serve', mode: 'development', isSsrBuild: true },
      mockOptions
    )

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=false for react-client condition', () => {
    const result = resolveUserConfig(
      'react-client',
      [],
      {},
      { command: 'build', mode: 'production' },
      mockOptions
    )

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(false)
    }
  })

  it('errors when using server plugin without ssr flag', () => {
    const result = resolveUserConfig(
      'react-server',
      [],
      {},
      { command: 'build', mode: 'production' },
      mockOptions
    )

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.error.message).toContain('ssr must be true')
    }
  })

}) 