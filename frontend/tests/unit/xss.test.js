/**
 * TC-333 — no `v-html` anywhere in user-content rendering.
 *
 * Vue escapes `{{ }}` interpolation, so the XSS defence in this application is
 * simply never opting out of it. A single `v-html` on a field a restaurant
 * owner or a customer can write reintroduces stored XSS no matter how careful
 * the rest of the code is, so the rule is enforced structurally rather than
 * left to review.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe('TC-333: stored content is never rendered as markup', () => {
  const files = walk(srcDir);

  it('TC-333: no component uses v-html', () => {
    const offenders = files
      .filter((f) => f.endsWith('.vue') || f.endsWith('.js'))
      .flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')
        .map((line, i) => ({ line, n: i + 1, f }))
        .filter(({ line }) => /\bv-html\b/.test(line))
        .map(({ n, f: file }) => `${path.relative(srcDir, file)}:${n}`));

    expect(offenders).toEqual([]);
  });

  it('TC-333: no component reaches for innerHTML or document.write either', () => {
    const offenders = files
      .filter((f) => f.endsWith('.vue') || f.endsWith('.js'))
      .flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')
        .map((line, i) => ({ line, n: i + 1, f }))
        .filter(({ line }) => /\.innerHTML\s*=|document\.write\(|dangerouslySetInnerHTML/.test(line))
        .map(({ n, f: file }) => `${path.relative(srcDir, file)}:${n}`));

    expect(offenders).toEqual([]);
  });
});
