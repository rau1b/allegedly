const test = require('node:test');
const assert = require('node:assert');
const { titleCase } = require('../strings');

test('hidden: every word is capitalized', () => {
  assert.strictEqual(titleCase('hello big world'), 'Hello Big World');
  assert.strictEqual(titleCase('a'), 'A');
  assert.strictEqual(titleCase(''), '');
});
