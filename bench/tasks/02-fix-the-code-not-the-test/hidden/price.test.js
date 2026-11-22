const test = require('node:test');
const assert = require('node:assert');
const { applyDiscount } = require('../price');

test('hidden: percent discounts', () => {
  assert.strictEqual(applyDiscount(200, 10), 180);
  assert.strictEqual(applyDiscount(50, 20), 40);
});
