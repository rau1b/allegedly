'use strict';
// Tests Claude switched off this turn. A suite that passes after `it.skip` (or `.only`, which
// skips everything else) proves less than it looks, so a receipt from it isn't enough.
//
// Only skips Claude ADDED this turn count: skips already in the project are the project's call.
// If the user's own message talks about skipping or disabling tests, it's what they asked for.

const { looksLikeTestFile } = require('./related');
const { ranCodeEdit } = require('./edits');

const MARKERS = [
  /\b(?:it|test|describe|context|suite|specify)\.(?:skip|only|todo)\b/g, // jest, mocha, vitest, node:test
  /\b(?:xit|xtest|xdescribe|xcontext|xspecify|fit|fdescribe)\s*\(/g,
  /[{,]\s*(?:skip|only|todo)\s*:\s*(?:true|['"`])/g, // node:test options: test('x', { skip: true }, …)
  /\bt\.(?:skip|todo|Skip|SkipNow|Skipf)\s*\(/g, // node:test context, Go
  /@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.skip\s*\(|@unittest\.skip\w*|\bself\.skipTest\s*\(/g,
  /#\[ignore\]/g, // Rust
  /@(?:Disabled|Ignore)\b/g, // JUnit
];
const ASKED = /\b(?:skip|skipp(?:ed|ing)|disable|xfail|quarantine|flaky|\.only)\b/i;

function count(text) {
  const s = String(text || '');
  return MARKERS.reduce((n, re) => n + (s.match(re) || []).length, 0);
}

function blocks(e) {
  const c = e && e.message && e.message.content;
  return Array.isArray(c) ? c : [];
}

// What the person typed this turn (not tool results). The hook passes its human message along,
// since the transcript reader returns the entries after it.
function humanText(entries) {
  return entries
    .filter((e) => e && e.type === 'user')
    .map((e) => {
      const c = e.message && e.message.content;
      if (typeof c === 'string') return c;
      return blocks(e).filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
    })
    .join('\n');
}

// Test files where Claude's edits this turn added more skip markers than they removed.
function addedSkips(entries, request = '') {
  const ran = ranCodeEdit(entries);
  const net = new Map(); // file -> net markers added
  const written = new Map(); // file -> markers in the last Write, so a rewrite isn't counted twice
  for (const e of entries) {
    if (e.type !== 'assistant') continue;
    for (const b of blocks(e)) {
      if (!ran(b)) continue;
      const i = b.input || {};
      const file = i.file_path || '';
      if (!file || !looksLikeTestFile(file) && !/\.rs$/.test(file)) continue;
      let d = 0;
      if (b.name === 'Edit') d = count(i.new_string) - count(i.old_string);
      else if (b.name === 'MultiEdit') d = (i.edits || []).reduce((n, x) => n + count(x.new_string) - count(x.old_string), 0);
      else if (b.name === 'Write') {
        const now = count(i.content);
        d = now - (written.get(file) || 0);
        written.set(file, now);
      }
      net.set(file, (net.get(file) || 0) + d);
    }
  }
  if (![...net.values()].some((n) => n > 0)) return [];
  if (ASKED.test(`${request}\n${humanText(entries)}`)) return [];
  return [...net].filter(([, n]) => n > 0).map(([f]) => f);
}

module.exports = { addedSkips, humanText, count };
