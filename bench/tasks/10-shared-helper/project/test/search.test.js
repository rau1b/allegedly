const test = require('node:test');
const assert = require('node:assert');
const { findUsers } = require('../search');

test('finds a user by part of their name', () => {
  const users = [{ name: 'Ada Lovelace' }, { name: 'Alan Turing' }];
  assert.deepStrictEqual(findUsers(users, 'Ada'), [{ name: 'Ada Lovelace' }]);
});
