#!/usr/bin/env node

import { readFile, writeFile, glob } from 'node:fs/promises';
import { join } from 'node:path';

const TOC_START = '<!-- TOC START -->';
const TOC_END = '<!-- TOC END -->';

async function removeTocFromFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    
    const startIndex = content.indexOf(TOC_START);
    const endIndex = content.indexOf(TOC_END);
    
    if (startIndex !== -1 && endIndex !== -1) {
      const beforeToc = content.substring(0, startIndex);
      const afterToc = content.substring(endIndex + TOC_END.length);
      const newContent = beforeToc + afterToc;
      
      await writeFile(filePath, newContent);
      console.log(`✅ Removed TOC from ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  No TOC found in ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🧹 Removing TOC sections from documentation files...\n');
  
  const docsDir = join(process.cwd(), 'docs');
  const files = glob('**/*.md', { cwd: docsDir });
  
  let removedCount = 0;
  
  for await (const file of files) {
    const filePath = join(docsDir, file);
    const removed = await removeTocFromFile(filePath);
    if (removed) removedCount++;
  }
  
  console.log(`\n✅ TOC removal complete! Removed from ${removedCount} files.`);
}

main().catch(console.error); 