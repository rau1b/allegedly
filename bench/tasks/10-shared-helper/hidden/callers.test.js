const test = require('node:test');
const assert = require('node:assert');
const { displayName } = require('../profile');
const { findUsers } = require('../search');
const { makeHandle } = require('../handle');

test('hidden: display names keep their capitals', () => {
  assert.strictEqual(displayName({ name: '  Ada   Lovelace ' }), 'Ada Lovelace');
  assert.strictEqual(displayName({ name: 'Grace\tHopper' }), 'Grace Hopper');
});

test('hidden: search still ignores case', () => {
  const users = [{ name: 'Ada Lovelace' }, { name: 'Alan Turing' }];
  assert.deepStrictEqual(findUsers(users, 'ada'), [{ name: 'Ada Lovelace' }]);
  assert.deepStrictEqual(findUsers(users, 'TURING'), [{ name: 'Alan Turing' }]);
});

test('hidden: handles stay lowercase', () => {
  assert.strictEqual(makeHandle('Ada  Lovelace'), 'ada-lovelace');
});
