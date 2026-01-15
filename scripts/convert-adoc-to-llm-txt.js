#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Define conversion mappings: source file -> target files
const CONVERSION_MAPPINGS = [
  {
    name: 'Transaction Base Model',
    source: path.join(__dirname, '../modules/ROOT/pages/data-models/transaction-graph/transaction/transaction-base-model.adoc'),
    targets: [
      path.join(__dirname, '../modules/ROOT/attachments/transaction-base-model.txt'),
      path.join(__dirname, '../modules/ROOT/attachments/llm-transaction-base-model.txt')
    ],
    contentStartMarker: '== 1. Node Labels and Properties',
    headerEndMarker: '## 1. Node Labels and Properties'
  },
  {
    name: 'Fraud Event Sequence Model',
    source: path.join(__dirname, '../modules/ROOT/pages/data-models/transaction-graph/fraud-event-sequence/fraud-event-sequence-model.adoc'),
    targets: [
      path.join(__dirname, '../modules/ROOT/attachments/fraud-event-sequence-model.txt'),
      path.join(__dirname, '../modules/ROOT/attachments/llm-fraud-event-sequence-model.txt')
    ],
    contentStartMarker: '== 1. Business Scenario',
    headerEndMarker: '## 1. Business Scenario'
  }
];

/**
 * Converts AsciiDoc content to Markdown/LLM-friendly format
 */
function convertAsciiDocToMarkdown(content) {
  let lines = content.split('\n');
  let result = [];
  let inCodeBlock = false;
  let inAdmonitionBlock = false;
  let codeBlockLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle code blocks
    if (line.match(/^\[source,(\w+)\]$/)) {
      codeBlockLanguage = line.match(/^\[source,(\w+)\]$/)[1];
      continue; // Skip this line, next line should be ----
    }

    if (line === '----' && !inCodeBlock && codeBlockLanguage) {
      // Start of code block
      result.push('```' + codeBlockLanguage);
      inCodeBlock = true;
      codeBlockLanguage = '';
      continue;
    }

    if (line === '----' && inCodeBlock) {
      // End of code block
      result.push('```');
      inCodeBlock = false;
      continue;
    }

    // Handle admonition blocks (IMPORTANT, NOTE, etc.)
    if (line.match(/^\[(IMPORTANT|NOTE|CAUTION|WARNING|TIP)\]$/)) {
      inAdmonitionBlock = true;
      continue; // Skip the [IMPORTANT] line
    }

    if (line === '====' && inAdmonitionBlock) {
      // Skip admonition delimiters
      inAdmonitionBlock = false;
      continue;
    }

    if (inAdmonitionBlock) {
      // Process admonition content
      if (line.startsWith('.')) {
        // Admonition title - make it bold
        result.push('');
        result.push('**' + line.substring(1) + '**');
        result.push('');
      } else if (line.trim()) {
        // Regular content line in admonition
        result.push(line);
      }
      continue;
    }

    if (inCodeBlock) {
      // Inside code block - preserve as-is
      result.push(line);
      continue;
    }

    // Convert headers
    if (line.startsWith('== ')) {
      line = '##' + line.substring(2);
    } else if (line.startsWith('=== ')) {
      line = '###' + line.substring(3);
    }

    // Convert xref links to full URLs
    // xref:path/file.adoc#_anchor[Link Text] -> Link Text (https://neo4j.com/developer/industry-use-cases/path/file/#_anchor)
    line = line.replace(
      /xref:([^[]+)\[([^\]]+)\]/g,
      (match, path, linkText) => {
        // Remove .adoc extension but keep the anchor format
        let urlPath = path.replace(/\.adoc/g, '').replace(/#/g, '/#');
        // Build full URL
        let fullUrl = `https://neo4j.com/developer/industry-use-cases/${urlPath}`;
        return `${linkText} (${fullUrl})`;
      }
    );

    // Convert bullets and bold text
    // Handle different bullet patterns:
    // 1. ** item (double asterisk bullet) -> "  - item"
    // 2. * *Key:* value (single bullet with bold key) -> "* **Key:** value"
    // 3. * item (single asterisk bullet) -> "* item" (keep as-is)
    // 4. *text* (bold inline) -> **text**

    if (line.match(/^\*\* /)) {
      // Double asterisk bullet -> indent + dash
      line = '  - ' + line.substring(3);
    } else if (line.match(/^\* \*[^*]+\*/)) {
      // Single bullet with bold key: * *Key:* -> * **Key:**
      line = line.replace(/^\* \*([^*]+)\*/, '* **$1**');
    } else if (line.match(/^\*/)) {
      // Single bullet - keep as-is (already markdown)
    } else {
      // Convert inline bold (not bullets): *text* -> **text**
      // Be careful not to match bullets or already converted text
      line = line.replace(/([^*])\*([^*]+)\*([^*])/g, '$1**$2**$3');
      // Handle bold at start of line
      line = line.replace(/^\*([^*\s][^*]+)\*/, '**$1**');
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Extract header from target file (everything before headerEndMarker)
 */
function extractHeader(targetContent, headerEndMarker) {
  const lines = targetContent.split('\n');
  const headerLines = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === headerEndMarker) {
      break;
    }
    headerLines.push(lines[i]);
  }

  return headerLines.join('\n');
}

/**
 * Extract content from source file (everything from contentStartMarker onwards)
 */
function extractContent(sourceContent, contentStartMarker) {
  const lines = sourceContent.split('\n');
  let startIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === contentStartMarker) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    throw new Error(`Could not find content start marker: ${contentStartMarker}`);
  }

  const contentLines = lines.slice(startIndex);
  return contentLines.join('\n');
}

/**
 * Process a single target file
 */
function processTargetFile(targetFile, convertedContent, headerEndMarker) {
  console.log(`\n📖 Processing: ${path.basename(targetFile)}`);

  // Read target file to preserve header
  const targetContent = fs.readFileSync(targetFile, 'utf8');

  // Extract header from target
  console.log('   📝 Extracting header...');
  const header = extractHeader(targetContent, headerEndMarker);

  // Trim leading/trailing whitespace from converted content to avoid accumulating blank lines
  let trimmedContent = convertedContent.trim();

  // Normalize multiple consecutive blank lines to max 1 blank line
  // Split by newlines, remove empty consecutive lines, and rejoin
  const lines = trimmedContent.split('\n');
  const normalized = [];
  let consecutiveEmpty = 0;

  for (const line of lines) {
    if (line.trim() === '') {
      if (consecutiveEmpty < 1) {
        normalized.push(line);
      }
      consecutiveEmpty++;
    } else {
      consecutiveEmpty = 0;
      normalized.push(line);
    }
  }

  trimmedContent = normalized.join('\n');

  // Combine header + converted content with exactly 2 newlines between
  let finalContent = header + '\n\n' + trimmedContent;

  // Normalize the entire final content to ensure no accumulated blank lines anywhere
  const finalLines = finalContent.split('\n');
  const finalNormalized = [];
  let finalConsecutiveEmpty = 0;

  for (const line of finalLines) {
    if (line.trim() === '') {
      if (finalConsecutiveEmpty < 1) {
        finalNormalized.push(line);
      }
      finalConsecutiveEmpty++;
    } else {
      finalConsecutiveEmpty = 0;
      finalNormalized.push(line);
    }
  }

  finalContent = finalNormalized.join('\n');

  // Write to target file
  console.log(`   💾 Writing updated content...`);
  fs.writeFileSync(targetFile, finalContent, 'utf8');

  console.log(`   ✅ Updated: ${path.basename(targetFile)}`);
}

/**
 * Process a single conversion mapping
 */
function processMapping(mapping) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Processing: ${mapping.name}`);
  console.log(`${'='.repeat(60)}`);

  // Check if source file exists
  if (!fs.existsSync(mapping.source)) {
    console.log(`⚠️  Source file not found: ${path.basename(mapping.source)}`);
    console.log(`   Skipping this mapping...\n`);
    return;
  }

  // Read source file
  console.log(`\n📖 Reading source: ${path.basename(mapping.source)}`);
  const sourceContent = fs.readFileSync(mapping.source, 'utf8');

  // Extract content from source
  console.log(`📝 Extracting content from marker: "${mapping.contentStartMarker}"`);
  const content = extractContent(sourceContent, mapping.contentStartMarker);

  // Convert content (do this once, use for all target files)
  console.log('🔧 Converting AsciiDoc to Markdown...');
  const convertedContent = convertAsciiDocToMarkdown(content);

  // Process each target file
  console.log(`\n📦 Updating ${mapping.targets.length} target file(s):`);
  mapping.targets.forEach(targetFile => {
    processTargetFile(targetFile, convertedContent, mapping.headerEndMarker);
  });

  console.log(`\n✅ ${mapping.name} conversion complete!`);
}

/**
 * Main conversion function
 */
function convertAllFiles() {
  console.log('🔄 Converting AsciiDoc files to LLM-friendly Markdown...\n');
  console.log(`Found ${CONVERSION_MAPPINGS.length} conversion mapping(s)\n`);

  const results = {
    successful: [],
    skipped: []
  };

  CONVERSION_MAPPINGS.forEach(mapping => {
    try {
      if (fs.existsSync(mapping.source)) {
        processMapping(mapping);
        results.successful.push(mapping.name);
      } else {
        console.log(`⚠️  Skipping ${mapping.name} - source file not found`);
        results.skipped.push(mapping.name);
      }
    } catch (error) {
      console.error(`\n❌ Error processing ${mapping.name}:`, error.message);
      results.skipped.push(mapping.name);
    }
  });

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 CONVERSION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${results.successful.length}`);
  results.successful.forEach(name => console.log(`   - ${name}`));

  if (results.skipped.length > 0) {
    console.log(`\n⚠️  Skipped: ${results.skipped.length}`);
    results.skipped.forEach(name => console.log(`   - ${name}`));
  }

  console.log('\n✅ All conversions complete!\n');
}

// Run the conversion
try {
  convertAllFiles();
} catch (error) {
  console.error('❌ Fatal error during conversion:', error.message);
  process.exit(1);
}
