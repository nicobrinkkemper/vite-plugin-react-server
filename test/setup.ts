import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

export async function setupIndexHTML(testDir: string) {
  await writeFile(
    resolve(testDir, "index.html"),
    `<!DOCTYPE html>
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
  `
  );
}

export async function setupClientTSX(testDir: string) {
  await writeFile(
    resolve(testDir, "src/client.tsx"),
    `"use client"
  import React from 'react'
  import { createRoot } from 'react-dom/client'
  const root = createRoot(document.getElementById('root')!)
  root.render(<div>Client App</div>)
  `
  );
}

export async function setupServerTSX(testDir: string) {
  await writeFile(
    resolve(testDir, "src/server.tsx"),
    `"use server"
  import React from 'react'
  export function TestServerAction() {
    return <div>Server</div>
  }
  `
  );
}

export async function setupLinkClientTSX(testDir: string) {
  await mkdir(resolve(testDir, "src/components"), { recursive: true });
  // Create Link component
  await writeFile(
    resolve(testDir, "src/components/Link.client.tsx"),
    `"use client"
  import React from 'react'
  
  export function Link({ to, children }: { to: string, children: React.ReactNode }) {
    return <a href={to}>{children}</a>
  }
  `
  );
}
export async function setupPropsTS(testDir: string) {
  await writeFile(
    resolve(testDir, "src/page/props.ts"),
    `
export const props = (url: string)=>({
  title: 'Test',
  url
})
`
  );
}

export async function setupPageTSX(testDir: string) {
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page/test.module.css"),
    `.test {color: red}
.shared {background: white}
.unused {display: none}`
  );
  await setupLinkClientTSX(testDir);
  await setupPropsTS(testDir);
  // First page
  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    `
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
`
  );
}

export async function setupPageTSX2(testDir: string) {

  await mkdir(resolve(testDir, "src/page2"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page2/props.ts"),
    `
export const props = (url: string)=>({
  title: 'Test Page 2',
  url
})
`
  );

  await writeFile(
    resolve(testDir, "src/page2/test.module.css"),
    `.test {color: blue;}
.shared {background: gray;}
.unused {display: none;}`
  );
  await writeFile(
    resolve(testDir, "src/page2/page.tsx"),
    `"use server"
  import React from 'react'
  import styles from './test.module.css'
  export function Page() {
    return React.createElement('div', {className: styles.test}, 
      React.createElement('span', {className: styles.shared}, 'Test Page 2')
    )
  }
  `
  );
}

export async function setupTestProject(testDir: string) {
  // Create base directories
  await mkdir(testDir, { recursive: true });
  await mkdir(resolve(testDir, "src"), { recursive: true });
  await mkdir(resolve(testDir, "src/components"), { recursive: true });

  // Create test files
  await setupIndexHTML(testDir);
  await setupClientTSX(testDir);
  await setupServerTSX(testDir);
  await setupPageTSX(testDir);
  await setupPageTSX2(testDir);
}

export async function setupTestProjectEnv(testDir: string) {
  // Create base directories
  await mkdir(testDir, { recursive: true });
  await mkdir(resolve(testDir, "src"), { recursive: true });
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await setupIndexHTML(testDir);
  await setupClientTSX(testDir);
  await setupPageTSX2(testDir);

  // Create a test page component
  await writeFile(
    resolve(testDir, "src", "page", "page.tsx"),
    `import React from "react";

export function Page(propsEnv) {
return (
  <div>
    <h1>Home Page</h1>
    <p>Base URL: {propsEnv.BASE_URL}</p>
    <p>Public: {propsEnv.PUBLIC_ORIGIN}</p>
    <p>Mode: {import.meta.env.MODE}</p>
    <p>Prod: {import.meta.env.PROD}</p>
    <p>Dev: {import.meta.env.DEV}</p>
    <p>SSR: {import.meta.env.SSR}</p>
    <p>URL: {import.meta.env.BASE_URL}</p>
    <p>Public Origin: {import.meta.env.PUBLIC_ORIGIN}</p>
  </div>
);
}`
  );
  await writeFile(
    resolve(testDir, "src", "page", "props.ts"),
    `export const props = ()=>import.meta.env;`
  );

}
