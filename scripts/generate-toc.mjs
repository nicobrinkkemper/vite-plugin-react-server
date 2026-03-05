#!/usr/bin/env node

/**
 * Generate table of contents for documentation.
 * 
 * Reads docs/README.md TOC entries and can inject navigation
 * into individual doc files if they have <!-- TOC START --> / <!-- TOC END --> markers.
 * 
 * With the current doc structure, the TOC lives only in docs/README.md
 * and individual files don't embed navigation. This script is kept
 * for future use if navigation footers are desired.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, '../docs');
const README_PATH = join(DOCS_DIR, 'README.md');

function main() {
  console.log('📚 Documentation structure:\n');

  const readme = readFileSync(README_PATH, 'utf8');
  const lines = readme.split('\n');

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+\[.+\]\(.+\)/);
    if (match) {
      // Extract path and check existence
      const pathMatch = line.match(/\(\.\/([^)]+)\)/);
      if (pathMatch) {
        const filePath = join(DOCS_DIR, pathMatch[1]);
        const exists = existsSync(filePath);
        console.log(`  ${exists ? '✅' : '❌'} ${line.trim()}`);
      }
    }
  }

  console.log('\n✅ Done.');
}

main();
