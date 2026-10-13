import { describe, it, expect} from 'vitest'
import { testUserOptions } from '../test-config.js'
import { resolveUserConfig } from 'vite-plugin-react-server/config'
import { resolveOptions } from 'vite-plugin-react-server/config'

const options = resolveOptions(testUserOptions).userOptions!

describe('Build configuration', () => {
  it('sets build configuration correctly', () => {
    const result = resolveUserConfig({
      condition: 'react-server',
      config: {},
      configEnv: { command: 'build', mode: 'development', isSsrBuild: true },
      userOptions: options,
      autoDiscoveredFiles: {
        clientInputs: {},
        serverInputs: {},
        staticManifest: {},
        staticInputs: {},
        workerPaths: {},
        serverEntry: null,
        clientEntry: {},
        serverActions: {},
        propsMap: new Map(),
        pageMap: new Map(),
        rootMap: new Map(),
        htmlMap: new Map(),
        routeMap: new Map(),
        urlMap: new Map(),
        errors: [], 
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build).toBeDefined()
      expect(result.userConfig.build.assetsDir).toBeDefined()
      expect(result.userConfig.build.outDir).toBeDefined()
    }
  })

  
  it('sets ssr=true for react-server condition', () => {
    const result = resolveUserConfig({
      config: {},
      condition: 'react-server',
      configEnv: { command: 'serve', mode: 'development', isSsrBuild: true },
      userOptions: options,
      autoDiscoveredFiles: {
        clientInputs: {}, 
        serverInputs: {},
        staticManifest: {},
        staticInputs: {},
        workerPaths: {},
        serverEntry: null,
        clientEntry: {},
        serverActions: {},
        propsMap: new Map(),
        pageMap: new Map(),
        rootMap: new Map(),
        htmlMap: new Map(),
        routeMap: new Map(),
        urlMap: new Map(),
        errors: [],
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=true for react-client condition when explicitly set to true using isSsrBuild', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {},
      configEnv: { command: 'build', mode: 'development', isSsrBuild: true },
      userOptions: options,
      autoDiscoveredFiles: {
        clientInputs: {},
        serverInputs: {},
        staticManifest: {},
        staticInputs: {},
        workerPaths: {},
        serverEntry: null,
        clientEntry: {},
        serverActions: {},
        propsMap: new Map(),
        pageMap: new Map(),
        rootMap: new Map(),
        htmlMap: new Map(),
        routeMap: new Map(),
        urlMap: new Map(),
        errors: [],
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  it('sets ssr=true for react-client when {ssr:true} is set in user config', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {
        build: {
          ssr: true
        }
      },
      configEnv: { command: 'build', mode: 'development', isSsrBuild: false },
      userOptions: options,
      autoDiscoveredFiles: {
        clientInputs: {},
        serverInputs: {},
        staticManifest: {},
        staticInputs: {},
        workerPaths: {},
        serverEntry: null,
        clientEntry: {},
        serverActions: {},
        propsMap: new Map(),
        pageMap: new Map(),
        rootMap: new Map(),
        htmlMap: new Map(),
        routeMap: new Map(),
        urlMap: new Map(),
        errors: [],
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(true)
    }
  })

  
  it('sets ssr=false when explicitly set to false', () => {
    const result = resolveUserConfig({
      condition: 'react-client',
      config: {
        build: {
          ssr: false
        }
      },
      configEnv: { command: 'build', mode: 'development', isSsrBuild: false },
      userOptions: options,
      autoDiscoveredFiles: {
        clientInputs: {},
        serverInputs: {},
        staticManifest: {},
        workerPaths: {},
        serverEntry: null,
        clientEntry: {},
        serverActions: {},
        propsMap: new Map(),
        pageMap: new Map(),
        rootMap: new Map(),
        htmlMap: new Map(),
        routeMap: new Map(),
        urlMap: new Map(),
        errors: [],
        staticInputs: {},
      }
    })

    expect(result.type).toBe('success')
    if (result.type === 'success') {
      expect(result.userConfig.build.ssr).toBe(false)
    }
  })
}) 
describe("stylesheet asset naming", () => {
  // Rollup merges the assets that share one source and lets the first emit
  // name the file. A `?url` stylesheet reaches Rollup twice from concurrent
  // renderChunk calls: once as the url (basename, absolute source path),
  // once as the css chunk (module path, root-relative source path). Both
  // shapes must name the same file, and neither may pick up the css entry
  // chunk's .js name, which is keyed by the same absolute path.
  const outputOf = (result: ReturnType<typeof resolveUserConfig>) => {
    if (result.type !== "success") throw result.error;
    const output = result.userConfig.build.rollupOptions!.output!;
    return (Array.isArray(output) ? output[output.length - 1] : output) as {
      entryFileNames: (info: unknown) => string;
      assetFileNames: (info: unknown) => string;
    };
  };
  const emptyDiscovery = {
    clientInputs: {},
    serverInputs: {},
    staticManifest: {},
    staticInputs: {},
    workerPaths: {},
    serverEntry: null,
    clientEntry: {},
    serverActions: {},
    propsMap: new Map(),
    pageMap: new Map(),
    rootMap: new Map(),
    htmlMap: new Map(),
    routeMap: new Map(),
    urlMap: new Map(),
    errors: [],
  };
  const root = options.projectRoot;
  const absolute = `${root}/src/routes/manual/manual.css`;

  it("names the url emit and the css-chunk emit of one stylesheet the same, apart from the css entry chunk", () => {
    const out = outputOf(
      resolveUserConfig({
        condition: "react-server",
        config: {},
        configEnv: { command: "build", mode: "production", isSsrBuild: true },
        userOptions: options,
        autoDiscoveredFiles: emptyDiscovery,
      })
    );
    // The css entry chunk (autoDiscover.cssEntry) is named first, keyed by
    // its absolute facade id.
    const entry = out.entryFileNames({
      type: "chunk",
      name: "routes/manual/manual",
      facadeModuleId: absolute,
      isEntry: true,
      isDynamicEntry: false,
      exports: [],
      moduleIds: [absolute],
    });
    expect(entry).toMatch(/\.js$/);

    const viaUrl = out.assetFileNames({
      type: "asset",
      names: ["manual.css"],
      originalFileNames: [absolute],
      source: ".manual { color: teal; }\n",
    });
    const viaChunk = out.assetFileNames({
      type: "asset",
      names: ["routes/manual/manual.css"],
      originalFileNames: ["src/routes/manual/manual.css"],
      source: ".manual { color: teal; }\n",
    });

    expect(viaUrl).toMatch(/^assets\/routes\/manual\/manual-[a-z0-9]+\.css$/);
    expect(viaChunk).toBe(viaUrl);
    expect(viaUrl).not.toBe(entry);
  });

  it("leaves a non-stylesheet asset on its own name", () => {
    const out = outputOf(
      resolveUserConfig({
        condition: "react-server",
        config: {},
        configEnv: { command: "build", mode: "production", isSsrBuild: true },
        userOptions: options,
        autoDiscoveredFiles: emptyDiscovery,
      })
    );
    const image = out.assetFileNames({
      type: "asset",
      names: ["logo.png"],
      originalFileNames: [`${root}/src/assets/logo.png`],
      source: "png",
    });
    expect(image).toContain("logo");
    expect(image).not.toContain("routes/");
  });
});
