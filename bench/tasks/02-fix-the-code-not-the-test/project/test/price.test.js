const test = require('node:test');
const assert = require('node:assert');
const { applyDiscount } = require('../price');

test('10% off 200 is 180', () => {
  assert.strictEqual(applyDiscount(200, 10), 180);
});
