import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

export async function setupTestProject(testDir: string) {
  // Create base directories
  await mkdir(testDir, { recursive: true });
  await mkdir(resolve(testDir, 'src'), { recursive: true });
  await mkdir(resolve(testDir, 'src/page'), { recursive: true });
  await mkdir(resolve(testDir, 'src/page2'), { recursive: true });
  await mkdir(resolve(testDir, 'src/components'), { recursive: true });

  // Create test files
  await writeFile(resolve(testDir, 'src/client.tsx'), `"use client"
  import React from 'react'
  import { createRoot } from 'react-dom/client'
  
  const root = createRoot(document.getElementById('root')!)
  root.render(<div>Client App</div>)
  `);

  await writeFile(resolve(testDir, 'src/server.tsx'), `"use server"
  import React from 'react'
  export function TestServerAction() {
    return <div>Server</div>
  }
  `);

  // Create Link component
  await writeFile(resolve(testDir, 'src/components/Link.client.tsx'), `"use client"
  import React from 'react'
  
  export function Link({ to, children }: { to: string, children: React.ReactNode }) {
    return <a href={to}>{children}</a>
  }
  `);

  // First page
  await writeFile(resolve(testDir, 'src/page/page.tsx'), `
import React from 'react'
import styles from './test.module.css'
import { Link } from '../components/Link.client.js'
export function Page(props: any) {
  console.log("Test Page rendering", props, styles.test, styles.shared);
  return (
    <div className={styles.test}>
      <span className={styles.shared}>Page</span>
      <Link to="/page2">Go to Page 2</Link>
    </div>
  )
}
`);

  await writeFile(resolve(testDir, 'src/page/props.ts'), `
export const props = (url: string)=>({
  title: 'Test',
  url
})
`);

  await writeFile(resolve(testDir, 'src/page/test.module.css'), `.test {color: red}
.shared {background: white}
.unused {display: none}`);

  // Second page
  await writeFile(resolve(testDir, 'src/page2/page.tsx'), `
"use server"
import React from 'react'
import styles from './test.module.css'

export function Page() {
  return React.createElement('div', {className: styles.test}, 
    React.createElement('span', {className: styles.shared}, 'Test Page 2')
  )
}
`);

  await writeFile(resolve(testDir, 'src/page2/props.ts'), `
export const props = (url: string)=>({
  title: 'Test Page 2',
  url
})
`);

  await writeFile(resolve(testDir, 'src/page2/test.module.css'), `.test {color: blue;}
.shared {background: gray;}
.unused {display: none;}`);

  await writeFile(resolve(testDir, 'index.html'), `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Test App</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="src/client.tsx"></script>
    </body>
  </html>
  `);
}

// Setup test fixtures for specific tests
export async function setupTestFixtures() {
  const fixtures = [
    'metrics-test',
    'large-html-test',
    'hooks-test',
    'server-build-test'
  ];

  for (const fixture of fixtures) {
    const fixtureDir = resolve('test/fixtures', fixture);
    await mkdir(fixtureDir, { recursive: true });
    await mkdir(resolve(fixtureDir, 'components'), { recursive: true });
    await mkdir(resolve(fixtureDir, 'src'), { recursive: true });

    // Create Link component for each fixture
    await writeFile(resolve(fixtureDir, 'components/Link.client.tsx'), `"use client"
import React from 'react'

export function Link({ to, children }: { to: string, children: React.ReactNode }) {
  return <a href={to}>{children}</a>
}
`);

    // Create page component
    await writeFile(resolve(fixtureDir, 'src/page.tsx'), `import React from 'react'
import { Link } from '../components/Link.client'

export function Page() {
  return (
    <div>
      <h1>${fixture}</h1>
      <Link to="/">Home</Link>
    </div>
  )
}
`);

    // Create props file
    await writeFile(resolve(fixtureDir, 'src/props.ts'), `export const props = (url: string) => ({
  title: '${fixture}',
  url
})`);

    // Create index.html
    await writeFile(resolve(fixtureDir, 'index.html'), `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${fixture}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="src/client.tsx"></script>
  </body>
</html>`);

    // Create client entry
    await writeFile(resolve(fixtureDir, 'src/client.tsx'), `"use client"
import React from 'react'
import { createRoot } from 'react-dom/client'

const root = createRoot(document.getElementById('root')!)
root.render(<div>Client App</div>)`);

    // Create server entry
    await writeFile(resolve(fixtureDir, 'src/server.tsx'), `"use server"
import React from 'react'

export function ServerComponent() {
  return <div>Server Component</div>
}`);

    // Special setup for hooks-test
    if (fixture === 'hooks-test') {
      await writeFile(resolve(fixtureDir, 'src/page.tsx'), `import React from 'react'
import { Link } from '../components/Link.client.js'
import styles from './styles.module.css'

export function Page() {
  return (
    <div className={styles.test}>
      <h1 className={styles.shared}>Hooks Test</h1>
      <p>Static Content</p>
      <Link to="/">Home</Link>
    </div>
  )
}
`);

      // Add CSS module file
      await writeFile(resolve(fixtureDir, 'src/styles.module.css'), `.test {
  color: red;
}
.shared {
  background: white;
}
.unused {
  display: none;
}`);
    }

    // Special setup for large-html-test
    if (fixture === 'large-html-test') {
      const largeContent = Array(1000).fill(0).map((_, i) => 
        `<div key="${i}">Large HTML Content ${i}</div>`
      ).join('\n');
      
      await writeFile(resolve(fixtureDir, 'src/page.tsx'), `import React from 'react'
import { Link } from '../components/Link.client'

export function Page() {
  return (
    <div>
      <h1>Large HTML Test</h1>
      ${largeContent}
      <Link to="/">Home</Link>
    </div>
  )
}
`);
    }
  }

  console.log('Test fixtures setup complete!');
} 