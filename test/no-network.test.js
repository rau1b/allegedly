'use strict';
// Enforces the README promise: the hook contains no network code and can't start other programs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..', 'hooks');
const FORBIDDEN = [
  /require\(\s*['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process|worker_threads|inspector)['"]\s*\)/,
  /\bimport\s*\(?\s*['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process)['"]/,
  /\bfetch\s*\(/,
  /\bWebSocket\b/,
  /\bXMLHttpRequest\b/,
  /\bprocess\.binding\b/,
];

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return jsFiles(p);
    return /\.(?:c|m)?js$/.test(d.name) ? [p] : [];
  });
}

test('hook code has no network or process-spawning calls', () => {
  const files = jsFiles(HOOKS_DIR);
  assert.ok(files.length > 0, 'found hook files to check');
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(src), `${path.relative(HOOKS_DIR, file)} matches forbidden pattern ${re}`);
    }
  }
});
