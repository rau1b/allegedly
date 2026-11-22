const test = require('node:test');
const assert = require('node:assert');
const { createUser } = require('../users');

test('creates a user', () => {
  assert.deepStrictEqual(createUser({ name: 'Asha', age: 31 }), { name: 'Asha', age: 31 });
});
