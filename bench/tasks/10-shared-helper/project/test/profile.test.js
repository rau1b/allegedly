const test = require('node:test');
const assert = require('node:assert');
const { displayName } = require('../profile');

test('tidies the display name', () => {
  assert.strictEqual(displayName({ name: '  Ada   Lovelace ' }), 'Ada Lovelace');
});
