/**
 * E2E test server setup script.
 * Creates a test fixture and starts a Vite dev server.
 */
import { createServer } from 'vite';
import { vitePluginReactServer } from '../../dist/plugin/index.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '../fixtures/e2e-hmr');

async function setupFixture() {
  // Clean up
  await rm(fixtureDir, { recursive: true, force: true });
  
  // Create directories
  await mkdir(join(fixtureDir, 'src/page'), { recursive: true });
  
  // Create initial page
  await writeFile(
    join(fixtureDir, 'src/page/page.tsx'),
    `import React from "react";
export const Page = () => <div>Test Page</div>;`
  );
  
  // Create props
  await writeFile(
    join(fixtureDir, 'src/page/props.ts'),
    `export const props = () => ({});`
  );
  
  // Create client entry
  await writeFile(
    join(fixtureDir, 'src/client.tsx'),
    `import React, { use, useState, useTransition, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";

// Simple RSC fetcher for testing
async function fetchRSC() {
  const res = await fetch(window.location.pathname, {
    headers: { Accept: "text/x-component" }
  });
  // For testing, we'll just get the text and display it
  return res.text();
}

function App() {
  const [content, setContent] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  
  const refetch = useCallback(() => {
    startTransition(async () => {
      const text = await fetchRSC();
      setContent(text);
    });
  }, []);
  
  useEffect(() => {
    refetch();
    
    // Listen for HMR
    if (import.meta.hot) {
      import.meta.hot.on('vite-plugin-react-server:server-component-update', () => {
        console.log('[HMR] Server component updated');
        refetch();
      });
    }
  }, [refetch]);
  
  if (!content) return <div>Loading...</div>;
  
  // Display RSC stream content (for testing)
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
`
  );
  
  // Create index.html
  await writeFile(
    join(fixtureDir, 'index.html'),
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>E2E Test</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/client.tsx"></script>
</body>
</html>`
  );
}

async function main() {
  await setupFixture();
  
  const server = await createServer({
    root: fixtureDir,
    configFile: false,
    server: { 
      port: 3200, 
      strictPort: true,
      host: true,
    },
    plugins: [
      vitePluginReactServer({
        projectRoot: fixtureDir,
        moduleBase: 'src',
        verbose: true,
      }),
    ],
    logLevel: 'info',
  });
  
  await server.listen();
  console.log(`E2E test server running at http://localhost:3200`);
  
  // Keep running
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);
