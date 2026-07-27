/**
 * E2E test server setup script.
 * Uses bidoof-template as the test fixture.
 * 
 * This script starts bidoof-template's dev:rsc server on port 3200.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnViteDev, stopViteDev } from './devServer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use bidoof-template as the e2e test fixture
// It's already set up with the plugin and HMR
const bidoofDir = join(__dirname, '../../../bidoof-template');

async function main() {
  console.log('Starting bidoof-template dev server for e2e tests...');
  console.log('Directory:', bidoofDir);

  // spawnViteDev launches vite's real JS entry directly (no npx, no shell), so
  // the signal forwarding below reaches the actual dev-server process instead
  // of a wrapper shell that may orphan it (the leaked-spec-server class).
  const proc = spawnViteDev({
    dir: bidoofDir,
    port: 3200,
    stdio: 'inherit',
    env: {
      NODE_OPTIONS: '--conditions react-server',
      NODE_ENV: 'development',
      BASE_URL: '/',
      PUBLIC_ORIGIN: 'http://localhost:3200',
      FORCE_COLOR: '1',
      CHOKIDAR_USEPOLLING: 'true',
      CHOKIDAR_INTERVAL: '500',
    },
  });

  proc.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  const shutdown = () => {
    void stopViteDev(proc).then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
