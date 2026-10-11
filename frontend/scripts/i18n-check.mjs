/* eslint-disable no-console */
/**
 * Lists every literal t('...') string that has no Arabic translation.
 *
 *   node scripts/i18n-check.mjs            all of src/
 *   node scripts/i18n-check.mjs src/views/admin
 *
 * Only literal keys can be checked. Strings passed through a variable - a
 * label in a data array, say - must be added to the catalogue by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(root, process.argv[2] ?? 'src');

const AR = {};
const arDir = path.join(root, 'src/i18n/ar');
for (const file of fs.readdirSync(arDir).filter((f) => f.endsWith('.js'))) {
  Object.assign(AR, (await import(pathToFileURL(path.join(arDir, file)).href)).default);
}

const files = [];
const walk = (p) => {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) fs.readdirSync(p).forEach((f) => walk(path.join(p, f)));
  else if (/\.(vue|js)$/.test(p) && !p.includes(`${path.sep}i18n${path.sep}`)) files.push(p);
};
walk(target);

// t('...') or t("...") with the usual escapes; the first argument only.
const CALL = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
let missing = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const keys = new Set();
  for (const m of source.matchAll(CALL)) keys.add(m[2].replace(/\\(['"\\])/g, '$1'));
  const absent = [...keys].filter((k) => !(k in AR));
  if (absent.length) {
    console.log(`\n${path.relative(root, file)}`);
    absent.forEach((k) => console.log(`  ${JSON.stringify(k)}`));
    missing += absent.length;
  }
}
console.log(`\n${missing} missing translation(s), ${Object.keys(AR).length} in the catalogue.`);
process.exitCode = missing ? 1 : 0;
