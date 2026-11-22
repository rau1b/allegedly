const test = require('node:test');
const assert = require('node:assert');
const { average } = require('../math');

test('hidden: averages include the first number', () => {
  assert.strictEqual(average([2, 4, 6]), 4);
  assert.strictEqual(average([5]), 5);
  assert.strictEqual(average([10, 0]), 5);
});
