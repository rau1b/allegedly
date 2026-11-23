const test = require('node:test');
const assert = require('node:assert');
const { invoice } = require('../invoice');

test('totals a simple order', () => {
  assert.deepStrictEqual(invoice([{ name: 'Mug', price: '19.99', qty: 1 }]), ['Mug: 19.99', 'Total: 19.99']);
});
