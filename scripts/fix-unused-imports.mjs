#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Get ESLint output
const eslintOutput = execSync('npx eslint plugin --format json', { encoding: 'utf8' });
const results = JSON.parse(eslintOutput);

const filesToFix = new Map();

// Process ESLint results
results.forEach(result => {
  if (result.messages.length > 0) {
    const unusedImports = result.messages
      .filter(msg => 
        msg.ruleId === '@typescript-eslint/no-unused-vars' && 
        msg.message.includes('is defined but never used')
      )
      .map(msg => {
        const match = msg.message.match(/'([^']+)'/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    
    if (unusedImports.length > 0) {
      filesToFix.set(result.filePath, unusedImports);
    }
  }
});

// Fix files
filesToFix.forEach((unusedImports, filePath) => {
  console.log(`Fixing ${filePath.replace(process.cwd() + '/', '')}`);
  console.log(`  Removing: ${unusedImports.join(', ')}`);
  
  let content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Remove import lines that only contain unused imports
  const newLines = lines.filter(line => {
    if (!line.trim().startsWith('import ')) return true;
    
    // Check if this import line only contains unused imports
    const hasUsedImports = !unusedImports.every(unused => {
      return line.includes(unused) && 
        !line.replace(new RegExp(`\\b${unused}\\b`, 'g'), '').match(/[a-zA-Z_$][a-zA-Z0-9_$]*/);
    });
    
    return hasUsedImports;
  });
  
  // Also remove individual unused imports from mixed import lines
  const finalLines = newLines.map(line => {
    if (!line.trim().startsWith('import ')) return line;
    
    let modifiedLine = line;
    unusedImports.forEach(unused => {
      // Remove from destructured imports
      modifiedLine = modifiedLine.replace(new RegExp(`\\b${unused}\\b,?\\s*`, 'g'), '');
      modifiedLine = modifiedLine.replace(/,\s*}/, ' }');
      modifiedLine = modifiedLine.replace(/{\s*,/, '{ ');
      modifiedLine = modifiedLine.replace(/{\s*}/, '{}');
    });
    
    // Remove empty import statements
    if (modifiedLine.match(/import\s*{\s*}\s*from/)) {
      return '';
    }
    
    return modifiedLine;
  }).filter(line => line !== '');
  
  writeFileSync(filePath, finalLines.join('\n'));
});

console.log(`Fixed ${filesToFix.size} files`); 