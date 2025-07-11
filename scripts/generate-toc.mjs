#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOCS_DIR = join(__dirname, '../docs');
const README_PATH = join(DOCS_DIR, 'README.md');

// Markers for TOC injection
const TOC_START = '<!-- AUTO-GENERATED-TOC-START -->';
const TOC_END = '<!-- AUTO-GENERATED-TOC-END -->';

function extractTOCFromReadme() {
  const readmeContent = readFileSync(README_PATH, 'utf8');
  
  // Find the table of contents section
  const tocStartIndex = readmeContent.indexOf('## Table of Contents');
  const tocEndIndex = readmeContent.indexOf('## Plugin Architecture Documentation');
  
  if (tocStartIndex === -1 || tocEndIndex === -1) {
    throw new Error('Could not find Table of Contents section in README.md');
  }
  
  const tocSection = readmeContent.slice(tocStartIndex, tocEndIndex).trim();

  // Parse the TOC and build clickable links for sub-items
  const lines = tocSection.split('\n');
  let currentFile = null;
  let tocWithLinks = [];
  const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

  for (let line of lines) {
    // Main section: "1. [Getting Started](./getting-started.md)"
    const mainMatch = line.match(/^\d+\. \[([^\]]+)\]\(\.\/([^)]+)\)/);
    if (mainMatch) {
      const title = mainMatch[1];
      const filename = mainMatch[2];
      currentFile = filename;
      tocWithLinks.push(`${line}`);
      continue;
    }
    // Sub-item: "   - Installation and Setup"
    const subMatch = line.match(/^(\s*)- (.+)$/);
    if (subMatch && currentFile) {
      const indent = subMatch[1].replace(/   /g, '\t'); // convert 3 spaces to tab
      const text = subMatch[2];
      const link = `./${currentFile}#${anchor(text)}`;
      tocWithLinks.push(`${indent}- [${text}](${link})`);
      continue;
    }
    tocWithLinks.push(line);
  }

  // Add navigation note
  const tocWithNav = `${TOC_START}\n\n## 📚 Documentation Navigation\n\n${tocWithLinks.join('\n')}\n\n### Quick Links\n- [🏠 Main Documentation](./README.md)\n- [🚀 Getting Started](./getting-started.md)\n- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)\n- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)\n\n---\n\n${TOC_END}`;
  
  return tocWithNav;
}

function injectTOCIntoFile(filePath, toc) {
  const content = readFileSync(filePath, 'utf8');
  const fileName = filePath.split('/').pop();

  // Check if TOC markers already exist
  const hasMarkers = content.includes(TOC_START) && content.includes(TOC_END);

  // If TOC is a string, convert to array for manipulation
  let tocLines = toc.split('\n');
  // Highlight the current file in the TOC
  tocLines = tocLines.map(line => {
    // Match main TOC entry: "1. [Getting Started](./getting-started.md)"
    const mainMatch = line.match(/^(\d+\. )\[([^\]]+)\]\(\.\/([^)]+)\)/);
    if (mainMatch) {
      const entryFile = mainMatch[3];
      if (entryFile === fileName) {
        // Bold and add indicator
        return `${mainMatch[1]}**[${mainMatch[2]}](./${entryFile}) ← you are here**`;
      }
    }
    return line;
  });
  const tocWithHere = tocLines.join('\n');

  if (hasMarkers) {
    // Always replace everything between markers
    const beforeTOC = content.substring(0, content.indexOf(TOC_START));
    const afterTOC = content.substring(content.indexOf(TOC_END) + TOC_END.length);
    const newContent = beforeTOC + tocWithHere + afterTOC;
    writeFileSync(filePath, newContent, 'utf8');
    return 'updated';
  } else {
    // Find a safe place to insert TOC (not inside a code block)
    const lines = content.split('\n');
    let insertIndex = lines.length;
    let inCodeBlock = false;
    let codeBlockDepth = 0;
    // Scan from the end to find a safe insertion point
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const trimmedLine = line.trim();
      // Check for code block markers (including multiple backticks)
      if (trimmedLine.match(/^`{3,}/)) {
        codeBlockDepth++;
        inCodeBlock = codeBlockDepth % 2 === 1;
        continue;
      }
      if (!inCodeBlock && trimmedLine !== '') {
        insertIndex = i + 1;
        break;
      }
    }
    // Insert TOC at the safe position
    lines.splice(insertIndex, 0, '', tocWithHere);
    const newContent = lines.join('\n');
    writeFileSync(filePath, newContent, 'utf8');
    return 'inserted';
  }
}

function generateMainReadmeTable() {
  const readmeContent = readFileSync(README_PATH, 'utf8');
  
  // Find the table of contents section
  const tocStartIndex = readmeContent.indexOf('## Table of Contents');
  const tocEndIndex = readmeContent.indexOf('## Plugin Architecture Documentation');
  
  if (tocStartIndex === -1 || tocEndIndex === -1) {
    throw new Error('Could not find Table of Contents section in README.md');
  }
  
  const tocSection = readmeContent.slice(tocStartIndex, tocEndIndex).trim();
  
  // Parse the TOC to extract file names and descriptions
  const lines = tocSection.split('\n');
  const entries = [];
  
  for (const line of lines) {
    // Match pattern like: "1. [Getting Started](./getting-started.md)"
    const match = line.match(/^\d+\.\s+\[([^\]]+)\]\(\.\/([^)]+)\)/);
    if (match) {
      const title = match[1];
      const filename = match[2];
      
      // Find the description on the next line(s)
      let description = '';
      const lineIndex = lines.indexOf(line);
      for (let i = lineIndex + 1; i < lines.length; i++) {
        const nextLine = lines[i].trim();
        if (nextLine.startsWith('-')) {
          description = nextLine.substring(1).trim();
          break;
        } else if (nextLine && !nextLine.startsWith('[') && !nextLine.match(/^\d+\./)) {
          description = nextLine;
          break;
        }
      }
      
      entries.push({ title, filename, description });
    }
  }
  
  // Generate the markdown table
  let table = '| Topic | Description |\n';
  table += '|-------|-------------|\n';
  
  for (const entry of entries) {
    table += `| [${entry.title}](./docs/${entry.filename}) | ${entry.description} |\n`;
  }
  
  return table;
}

function updateMainReadmeTable() {
  const mainReadmePath = join(__dirname, '../README.md');
  let content = readFileSync(mainReadmePath, 'utf8');
  
  // Remove ALL existing documentation tables using regex
  const docTableRegex = /## Documentation\s*\n\s*\|.*?\n\s*\|.*?\n\s*(\|.*?\n\s*)*/gs;
  content = content.replace(docTableRegex, '');
  
  // Find the License section to add documentation before it
  const licenseStart = content.indexOf('## License');
  if (licenseStart === -1) {
    console.log('⚠️  Could not find License section in main README.md');
    return false;
  }
  
  const beforeLicense = content.substring(0, licenseStart);
  const licenseSection = content.substring(licenseStart);
  const newTable = generateMainReadmeTable();
  
  // Insert the documentation table just before License
  const newContent = beforeLicense + '## Documentation\n\n' + newTable + '\n\n' + licenseSection;
  writeFileSync(mainReadmePath, newContent, 'utf8');
  
  return true;
}

function main() {
  console.log('🔧 Generating table of contents for documentation files...\n');
  
  try {
    // Extract TOC from README
    const toc = extractTOCFromReadme();
    
    // Get all markdown files except README.md
    const files = readdirSync(DOCS_DIR)
      .filter(file => file.endsWith('.md') && file !== 'README.md')
      .sort();
    
    console.log(`📁 Found ${files.length} documentation files:\n`);
    
    // Process each file
    const results = [];
    for (const file of files) {
      const filePath = join(DOCS_DIR, file);
      const action = injectTOCIntoFile(filePath, toc);
      results.push({ file, action });
      console.log(`   ${action === 'updated' ? '🔄' : '✨'} ${file} - ${action}`);
    }
    
    // Update main README.md documentation table
    console.log('\n📝 Updating main README.md documentation table...');
    const mainReadmeUpdated = updateMainReadmeTable();
    if (mainReadmeUpdated) {
      console.log('   ✅ Main README.md documentation table updated');
    }
    
    console.log('\n✅ Table of contents generation complete!');
    console.log(`   📝 ${results.filter(r => r.action === 'updated').length} files updated`);
    console.log(`   ➕ ${results.filter(r => r.action === 'inserted').length} files had TOC inserted`);
    
  } catch (error) {
    console.error('❌ Error generating table of contents:', error.message);
    process.exit(1);
  }
}

main(); 