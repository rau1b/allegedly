const test = require('node:test');
const assert = require('node:assert');
const { average } = require('../math');

test('average of 2, 4, 6 is 4', () => {
  assert.strictEqual(average([2, 4, 6]), 4);
});
