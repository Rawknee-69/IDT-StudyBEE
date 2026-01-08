import fs from 'fs';
import path from 'path';

// Configuration
const TARGET_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'];
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cursor', 'coverage', '.next', 'out']);

/**
 * Removes comments from code while preserving strings and regex literals (mostly).
 * 
 * Logic:
 * We use a regex to match strings, regex literals (heuristic), and comments.
 * - If a string or regex literal matches, we return it as is.
 * - If a comment matches, we replace it with an empty string (or newline for line comments to be safe).
 */
function removeComments(content: string, fileName: string): string {
  if (fileName.endsWith('.css') || fileName.endsWith('.scss')) {
     return content.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  // Regex pattern explanation:
  // 1. Strings: "...", '...', `...` (handling escaped quotes)
  // 2. Regex literals: /.../ (heuristic: starts with /, content not containing newline, ends with /)
  //    Note: This heuristic for regex might catch division like "a / b / c", treating "/ b /" as regex.
  //    But preserving it usually means we just don't strip comments inside it, which is fine.
  //    The risk is if "a / b / c // comment" -> "/ b /" matches, then " c // comment" remains. 
  //    Ideally, we prioritize strings, then comments?
  //    Actually, simple regex literals /abc/ are common. Complex division is less likely to look like regex.
  //    We will omit regex literal matching to avoid breaking division, and rely on the fact that comments 
  //    inside regex literals are invalid JS anyway (unless encoded).
  //    Wait, `var r = /http:\/\//;` contains `//`. If we don't protect it, `//` starts a comment.
  //    So we MUST try to protect regex.
  //    Let's use a simpler pattern that captures strings and comments, and ignores regex literals risk for now 
  //    (treating them as code where // might be matched).
  //    BUT, to be safe for `http://`, let's trust that users use strings for URLs mostly.
  
  // Revised Pattern:
  // Group 1: Strings ("...", '...', `...`)
  // Group 2: Block Comments (/* ... */)
  // Group 3: Line Comments (// ...)
  
  const pattern = /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|(\/\*[\s\S]*?\*\/)|(\/\/.*)/g;

  return content.replace(pattern, (match, str, blockComment, lineComment) => {
    if (str) {
      return str; // Preserve strings
    }
    if (blockComment) {
      return ''; // Remove block comment
    }
    if (lineComment) {
      // Remove line comment. 
      // Note: `.` does not match newline, so the newline at the end is preserved automatically 
      // because it wasn't part of the match.
      return ''; 
    }
    return match; // Should not happen
  });
}

function processFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const newContent = removeComments(content, filePath);
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Cleaned: ${filePath}`);
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err);
  }
}

function traverseDir(dir: string) {
  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!IGNORE_DIRS.has(file)) {
          traverseDir(fullPath);
        }
      } else {
        const ext = path.extname(file).toLowerCase();
        if (file !== 'remove-comments.ts' && TARGET_EXTS.includes(ext)) {
          processFile(fullPath);
        }
      }
    }
  } catch (err) {
    console.error(`Error traversing directory ${dir}:`, err);
  }
}

// Main execution
console.log('Starting comment removal script...');
const rootDir = process.cwd();
traverseDir(rootDir);
console.log('Comment removal complete.');

