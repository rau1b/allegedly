const test = require('node:test');
const assert = require('node:assert');
const { titleCase } = require('../strings');

test('capitalizes a word', () => {
  assert.strictEqual(titleCase('hello'), 'Hello');
});
