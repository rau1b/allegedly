'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeScrubber } = require('../bench/scrub.js');

const scrub = makeScrubber('C:\\Users\\alice', 'alice');

test('init lines keep only model and permission mode', () => {
  const line = JSON.stringify({ type: 'system', subtype: 'init', cwd: 'C:\\Users\\alice\\x', model: 'm', permissionMode: 'dontAsk', plugins: [{ name: 'secret' }], tools: ['Bash'] });
  assert.deepStrictEqual(JSON.parse(scrub(line)), { type: 'system', subtype: 'init', model: 'm', permissionMode: 'dontAsk' });
});

test('home folder is replaced in every path form', () => {
  const line = JSON.stringify({ type: 'user', text: 'C:\\Users\\alice\\a c:/users/alice/b /c/Users/alice/c C--Users-alice-d' });
  const out = scrub(line);
  assert.doesNotMatch(out, /alice/i);
  assert.match(out, /~\\\\a ~\/b ~\/c ~-d/);
});

test('bare username is replaced, longer words are not', () => {
  assert.strictEqual(scrub('alice wrote malice'), 'user wrote malice');
});
