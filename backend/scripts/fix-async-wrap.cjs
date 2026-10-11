/**
 * One-off codemod: balances the parenthesis for `asyncHandler(async (req, res) => {`
 * wrappers by matching braces rather than by pattern-matching line endings.
 *
 * Kept in the repository only because it documents how the wrapping was applied;
 * it is not part of the build.
 */
const fs = require('fs');

const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');

// Step 1: undo the blind line-based replacement.
src = src.replace(/^\}\)\);$/gm, '});');

// Step 2: for each wrapper, walk braces to find its true end and add the paren.
const MARKER = 'asyncHandler(async (req, res) => {';
let index = 0;
let added = 0;

for (;;) {
  index = src.indexOf(MARKER, index);
  if (index === -1) break;

  let depth = 0;
  let i = index + MARKER.length - 1; // position of the opening brace
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  // i is the matching closing brace. Two call shapes reach here:
  //   router.get(path, asyncHandler(async (req,res) => { ... });   <- single line tail
  //   router.post(path, mw, asyncHandler(async (req,res) => { ... },\n);  <- multi-line
  const tail = src.slice(i + 1, i + 3);
  if (tail === ');') {
    src = `${src.slice(0, i + 1)}));${src.slice(i + 3)}`;
    added += 1;
  } else if (src[i + 1] === ',') {
    src = `${src.slice(0, i + 1)}),${src.slice(i + 2)}`;
    added += 1;
  }
  index += MARKER.length;
}

fs.writeFileSync(file, src);
console.log(`${file}: balanced ${added} wrappers`);
