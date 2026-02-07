import type { FlightConfig, FlightTarget } from '../types.js';

// Base configuration with default exports
// most of these are probably wrong, but in the future we might be able to target 
// other targets than -esm, for example for use in nextjs.
const baseConfig: FlightConfig = {
  rsc: {
    client: {
      browser: {
        production: "react-server-dom-esm/client.browser",
        development: "react-server-dom-esm/client.browser",
        test: "react-server-dom-esm/client.browser",
        exports: {
          createFromFetch: "createFromFetch",
          createFromReadableStream: "createFromReadableStream",
          createServerReference: "createServerReference",
          createTemporaryReferenceSet: "createTemporaryReferenceSet",
          encodeReply: "encodeReply",
          registerServerReference: "registerServerReference"
        }
      },
      node: {
        production: "react-server-dom-esm/client",
        development: "react-server-dom-esm/client.node",
        test: "react-server-dom-esm/client.node",
        exports: {
          createFromNodeStream: "createFromNodeStream",
          createServerReference: "createServerReference",
          registerServerReference: "registerServerReference"
        }
      }
    },
    server: {
      production: "react-server-dom-esm/server",
      development: "react-server-dom-esm/server.node",
      test: "react-server-dom-esm/server.node",
      exports: {
        createTemporaryReferenceSet: "createTemporaryReferenceSet",
        decodeAction: "decodeAction",
        decodeFormState: "decodeFormState",
        decodeReply: "decodeReply",
        decodeReplyFromBusboy: "decodeReplyFromBusboy",
        registerClientReference: "registerClientReference",
        registerServerReference: "registerServerReference",
        renderToPipeableStream: "renderToPipeableStream",
        unstable_prerenderToNodeStream: "unstable_prerenderToNodeStream"
      }
    }
  },
  vendor: {
    react: "react",
    reactDOMServer: "react-dom/server"
  }
};

// Target-specific configurations
const targetConfigs: Record<FlightTarget, Partial<FlightConfig>> = {
  default: {},
  webpack: {
    rsc: {
      client: {
        browser: {
          production: "react-server-dom-webpack/client",
          development: "react-server-dom-webpack/client",
          test: "react-server-dom-webpack/client",
          exports: baseConfig.rsc.client.browser.exports
        },
        node: {
          production: "react-server-dom-webpack/client",
          development: "react-server-dom-webpack/client",
          test: "react-server-dom-webpack/client",
          exports: baseConfig.rsc.client.node.exports
        }
      },
      server: {
        production: "react-server-dom-webpack/server",
        development: "react-server-dom-webpack/server",
        test: "react-server-dom-webpack/server",
        exports: baseConfig.rsc.server.exports
      }
    }
  },
  nextjs: {
    rsc: {
      client: {
        browser: {
          production: "react-server-dom-webpack/client",
          development: "react-server-dom-webpack/client",
          test: "react-server-dom-webpack/client",
          exports: baseConfig.rsc.client.browser.exports
        },
        node: {
          production: "react-server-dom-webpack/client",
          development: "react-server-dom-webpack/client",
          test: "react-server-dom-webpack/client",
          exports: baseConfig.rsc.client.node.exports
        }
      },
      server: {
        production: "react-server-dom-webpack/server.edge",
        development: "react-server-dom-webpack/server.edge",
        test: "react-server-dom-webpack/server.edge",
        exports: baseConfig.rsc.server.exports
      }
    }
  },
  'react-server-dom-esm': {
    rsc: {
      client: {
        browser: {
          production: "react-server-dom-esm/client.browser",
          development: "react-server-dom-esm/client.browser",
          test: "react-server-dom-esm/client.browser",
          exports: baseConfig.rsc.client.browser.exports
        },
        node: {
          production: "react-server-dom-esm/client",
          development: "react-server-dom-esm/client.node",
          test: "react-server-dom-esm/client.node",
          exports: baseConfig.rsc.client.node.exports
        }
      },
      server: {
        production: "react-server-dom-esm/server",
        development: "react-server-dom-esm/server.node",
        test: "react-server-dom-esm/server.node",
        exports: baseConfig.rsc.server.exports
      }
    }
  },
  'react-server-dom-webpack': {
    rsc: {
      client: {
        browser: {
          production: "react-server-dom-webpack/client",
          development: "react-server-dom-webpack/client",
          test: "react-server-dom-webpack/client",
          exports: baseConfig.rsc.client.browser.exports
        },
        node: {
          production: "react-server-dom-webpack/client",
          development: "react-server-dom-webpack/client",
          test: "react-server-dom-webpack/client",
          exports: baseConfig.rsc.client.node.exports
        }
      },
      server: {
        production: "react-server-dom-webpack/server",
        development: "react-server-dom-webpack/server",
        test: "react-server-dom-webpack/server",
        exports: baseConfig.rsc.server.exports
      }
    }
  },
  'react-server-dom-parcel': {
    rsc: {
      client: {
        browser: {
          production: "react-server-dom-parcel/client",
          development: "react-server-dom-parcel/client",
          test: "react-server-dom-parcel/client",
          exports: baseConfig.rsc.client.browser.exports
        },
        node: {
          production: "react-server-dom-parcel/client",
          development: "react-server-dom-parcel/client",
          test: "react-server-dom-parcel/client",
          exports: baseConfig.rsc.client.node.exports
        }
      },
      server: {
        production: "react-server-dom-parcel/server",
        development: "react-server-dom-parcel/server",
        test: "react-server-dom-parcel/server",
        exports: baseConfig.rsc.server.exports
      }
    }
  }
};

export function createFlightBindings(
  target: FlightTarget = 'default',
  overrides?: Partial<FlightConfig>
): FlightConfig {
  // Merge configurations in order: base -> target -> overrides
  return {
    ...baseConfig,
    ...targetConfigs[target],
    ...overrides,
    rsc: {
      ...baseConfig.rsc,
      ...targetConfigs[target].rsc,
      ...overrides?.rsc,
      client: {
        browser: {
          ...baseConfig.rsc.client.browser,
          ...targetConfigs[target].rsc?.client?.browser,
          ...overrides?.rsc?.client?.browser
        },
        node: {
          ...baseConfig.rsc.client.node,
          ...targetConfigs[target].rsc?.client?.node,
          ...overrides?.rsc?.client?.node
        }
      },
      server: {
        ...baseConfig.rsc.server,
        ...targetConfigs[target].rsc?.server,
        ...overrides?.rsc?.server
      }
    },
    vendor: {
      ...baseConfig.vendor,
      ...targetConfigs[target].vendor,
      ...overrides?.vendor
    }
  };
}

// For backward compatibility
export const defaultFlightBindings = createFlightBindings('default'); 