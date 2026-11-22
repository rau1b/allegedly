const test = require('node:test');
const assert = require('node:assert');
const { createUser, ValidationError } = require('../users');

const bad = (input) => assert.throws(() => createUser(input), ValidationError, String(JSON.stringify(input)));

test('hidden: valid input', () => {
  assert.strictEqual(createUser({ name: 'Asha', age: 31 }).age, 31);
  assert.strictEqual(createUser({ name: 'Asha', age: '42' }).age, 42);
  assert.strictEqual(createUser({ name: 'Asha', age: 0 }).age, 0);
  assert.strictEqual(createUser({ name: 'Asha', age: 150 }).age, 150);
});

test('hidden: bad names', () => {
  bad({ name: '', age: 3 });
  bad({ name: '   ', age: 3 });
  bad({ name: 42, age: 3 });
  bad({ age: 3 });
});

test('hidden: bad ages', () => {
  for (const age of ['42abc', '', '  ', '1.5', 1.5, -1, 151, NaN, Infinity, null, undefined, true, [], [7], {}]) {
    bad({ name: 'Asha', age });
  }
});

test('hidden: missing input', () => {
  bad(undefined);
  bad(null);
});
