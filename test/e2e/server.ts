/**
 * E2E test server setup script.
 * Uses bidoof-template as the test fixture.
 * 
 * This script starts bidoof-template's dev:rsc server on port 3200.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use bidoof-template as the e2e test fixture
// It's already set up with the plugin and HMR
const bidoofDir = join(__dirname, '../../../bidoof-template');

async function main() {
  console.log('Starting bidoof-template dev server for e2e tests...');
  console.log('Directory:', bidoofDir);
  
  // Create a temporary vite config override for e2e that enables polling (needed for WSL2)
  const { writeFileSync } = await import('node:fs');
  const overrideConfig = join(bidoofDir, 'vite.e2e.config.ts');
  writeFileSync(overrideConfig, `
import baseConfig from './vite.config.ts';
import { mergeConfig, defineConfig } from 'vite';
export default mergeConfig(baseConfig, defineConfig({
  server: { watch: { usePolling: true, interval: 100 } }
}));
`);

  // Start vite directly with proper env vars (npm script chain mangles port args)
  const proc = spawn('npx', ['vite', '--config', 'vite.e2e.config.ts', '--port', '3200', '--strictPort'], {
    cwd: bidoofDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: '--conditions react-server',
      NODE_ENV: 'development',
      BASE_URL: '/',
      PUBLIC_ORIGIN: 'http://localhost:3200',
      FORCE_COLOR: '1',
    },
  });
  
  proc.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
  
  const cleanup = () => {
    try { const { unlinkSync } = require('node:fs'); unlinkSync(overrideConfig); } catch {}
  };

  process.on('SIGINT', () => {
    cleanup();
    proc.kill('SIGINT');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    cleanup();
    proc.kill('SIGTERM');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
