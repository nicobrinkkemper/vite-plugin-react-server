#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOCS_DIR = join(__dirname, '../docs');
const README_PATH = join(DOCS_DIR, 'README.md');

// Markers for TOC injection
const TOC_START = '<!-- TOC START -->';
const TOC_END = '<!-- TOC END -->';

function extractTOCFromReadme() {
  const readmeContent = readFileSync(README_PATH, 'utf8');
  
  // Find the table of contents section
  const tocStartIndex = readmeContent.indexOf('## Table of Contents');
  const tocEndIndex = readmeContent.indexOf('## Quick Links');
  
  if (tocStartIndex === -1 || tocEndIndex === -1) {
    throw new Error('Could not find Table of Contents section in README.md');
  }
  
  const tocSection = readmeContent.slice(tocStartIndex, tocEndIndex).trim();

  // Parse the TOC and build clickable links for sub-items
  const lines = tocSection.split('\n');
  let currentFile = null;
  let currentNumber = 1;
  let tocWithLinks = [];
  const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

  for (let line of lines) {
    // Main section: "1. [Getting Started](./getting-started.md)"
    const mainMatch = line.match(/^(\d+)\. \[([^\]]+)\]\(\.\/([^)]+)\)/);
    if (mainMatch) {
      const number = parseInt(mainMatch[1]);
      const title = mainMatch[2];
      const filename = mainMatch[3];
      currentFile = filename;
      currentNumber = number;
      
      // Always use 1 tab between number and bracket to account for 2-digit numbers
      tocWithLinks.push(`${number}.\t[${title}](./${filename})`);
      continue;
    }
    // Sub-item: "   - Installation and Setup"
    const subMatch = line.match(/^(\s*)- (.+)$/);
    if (subMatch && currentFile) {
      const text = subMatch[2];
      const link = `./${currentFile}#${anchor(text)}`;
      
      // Always use 1 tab for sub-items
      const indent = '\t';
      
      tocWithLinks.push(`${indent}- [${text}](${link})`);
      continue;
    }
    // Only include lines that are part of the TOC (numbered items, sub-items, or empty lines)
    if (line.trim() === '' || line.match(/^\d+\./) || line.match(/^\s*-/)) {
      tocWithLinks.push(line);
    }
  }

  // Add navigation note (without the Table of Contents header or auto-generated comment)
  const tocWithNav = `${tocWithLinks.join('\n')}\n\n### Quick Links\n- [🏠 Main Documentation](./README.md)\n- [🚀 Getting Started](./getting-started.md)\n- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)\n- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)\n\n---`;
  
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
    // Match main TOC entry: "1. [Getting Started](./getting-started.md)" or "10. [Advanced Topics](./advanced-topics.md)"
    const mainMatch = line.match(/^(\d+)\.(\s*)\[([^\]]+)\]\(\.\/([^)]+)\)/);
    if (mainMatch) {
      const number = parseInt(mainMatch[1]);
      const spacing = mainMatch[2];
      const title = mainMatch[3];
      const entryFile = mainMatch[4];
      if (entryFile === fileName) {
        // Bold and add indicator, maintaining the spacing
        return `${number}.${spacing}**[${title}](./${entryFile}) ← you are here**`;
      }
    }
    return line;
  });
  const tocWithHere = tocLines.join('\n');

  if (hasMarkers) {
    // Always replace everything between markers
    const startIndex = content.indexOf(TOC_START);
    const endIndex = content.indexOf(TOC_END);
    
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      console.log(`⚠️  Invalid marker positions in ${filePath}`);
      return 'error';
    }
    
    // Remove everything between the markers (including the markers themselves)
    const beforeTOC = content.substring(0, startIndex);
    const afterTOC = content.substring(endIndex + TOC_END.length);
    
    // Add the new content with markers
    const newContent = beforeTOC + TOC_START + '\n\n## 📚 Documentation Navigation\n\n<!-- Auto-generated TOC - Do not edit manually -->\n\n## Table of Contents\n\n<!-- Auto-generated TOC - Do not edit manually -->\n\n' + tocWithHere + '\n\n' + TOC_END + afterTOC;
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
    // Insert TOC at the safe position with markers
    lines.splice(insertIndex, 0, '', TOC_START + '\n\n## 📚 Documentation Navigation\n\n<!-- Auto-generated TOC - Do not edit manually -->\n\n## Table of Contents\n\n<!-- Auto-generated TOC - Do not edit manually -->\n\n' + tocWithHere + '\n\n' + TOC_END);
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
      
      // Find the first sub-item as the description
      let description = '';
      let descriptionAnchor = '';
      const lineIndex = lines.indexOf(line);
      for (let i = lineIndex + 1; i < lines.length; i++) {
        const nextLine = lines[i].trim();
        if (nextLine.startsWith('-')) {
          // Extract the text and anchor from the first sub-item link
          const subMatch = nextLine.match(/^-\s*\[([^\]]+)\]\([^)]+#([^)]+)\)/);
          if (subMatch) {
            description = subMatch[1];
            descriptionAnchor = subMatch[2];
          } else {
            description = nextLine.substring(1).trim();
            descriptionAnchor = description.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
          }
          break;
        } else if (nextLine.match(/^\d+\./)) {
          // We've reached the next main item, stop looking
          break;
        }
      }
      
      entries.push({ title, filename, description, descriptionAnchor });
    }
  }
  
  // Generate the markdown table
  let table = '| Topic | Description |\n';
  table += '|-------|-------------|\n';
  
  for (const entry of entries) {
    // Use the extracted anchor or fallback to generated one
    const anchor = entry.descriptionAnchor || entry.description.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    table += `| [${entry.title}](./docs/${entry.filename}) | [${entry.description}](./docs/${entry.filename}#${anchor}) |\n`;
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

function updateMainReadmeTOC() {
  const mainReadmePath = join(__dirname, '../docs/README.md');
  let content = readFileSync(mainReadmePath, 'utf8');
  
  // Find the table of contents section - look for the first occurrence
  const tocStartIndex = content.indexOf('## Table of Contents');
  const tocEndIndex = content.indexOf('## Plugin Architecture Documentation');
  
  if (tocStartIndex === -1 || tocEndIndex === -1) {
    console.log('⚠️  Could not find Table of Contents section in docs/README.md');
    return false;
  }
  
  const beforeTOC = content.substring(0, tocStartIndex);
  const afterTOC = content.substring(tocEndIndex);
  
  // Generate the TOC with tab-based formatting
  const tocSection = content.slice(tocStartIndex, tocEndIndex).trim();
  const lines = tocSection.split('\n');
  let currentFile = null;
  let currentNumber = 1;
  let tocWithTabs = [];
  const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

  for (let line of lines) {
    // Main section: "1. [Getting Started](./getting-started.md)"
    const mainMatch = line.match(/^(\d+)\. \[([^\]]+)\]\(\.\/([^)]+)\)/);
    if (mainMatch) {
      const number = parseInt(mainMatch[1]);
      const title = mainMatch[2];
      const filename = mainMatch[3];
      currentFile = filename;
      currentNumber = number;
      
      // Always use 1 tab between number and bracket to account for 2-digit numbers
      tocWithTabs.push(`${number}.\t[${title}](./${filename})`);
      continue;
    }
    // Sub-item: "   - Installation and Setup"
    const subMatch = line.match(/^(\s*)- (.+)$/);
    if (subMatch && currentFile) {
      const text = subMatch[2];
      const link = `./${currentFile}#${anchor(text)}`;
      
      // Always use 1 tab for sub-items
      const indent = '\t';
      
      tocWithTabs.push(`${indent}- [${text}](${link})`);
      continue;
    }
    // Skip duplicate "## Table of Contents" headers and auto-generated comments
    if (line.trim() === '## Table of Contents' || line.trim() === '<!-- Auto-generated TOC - Do not edit manually -->') {
      continue;
    }
    // Skip empty lines that might be between duplicate headers
    if (line.trim() === '') {
      continue;
    }
    tocWithTabs.push(line);
  }
  
  const newTOC = `## Table of Contents\n\n<!-- Auto-generated TOC - Do not edit manually -->\n\n${tocWithTabs.join('\n')}\n`;
  const newContent = beforeTOC + newTOC + afterTOC;
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
    
    // Update docs README.md TOC with tab-based formatting
    console.log('\n📝 Updating docs README.md TOC formatting...');
    const docsTOCUpdated = updateMainReadmeTOC();
    if (docsTOCUpdated) {
      console.log('   ✅ Docs README.md TOC formatting updated');
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