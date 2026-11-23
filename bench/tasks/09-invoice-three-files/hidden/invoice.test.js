const test = require('node:test');
const assert = require('node:assert');
const { invoice } = require('../invoice');

test('hidden: prices that floats get wrong', () => {
  assert.deepStrictEqual(
    invoice([{ name: 'A', price: '0.29', qty: 1 }, { name: 'B', price: '19.99', qty: 3 }]),
    ['A: 0.29', 'B: 59.97', 'Total: 60.26'],
  );
});

test('hidden: refund lines', () => {
  assert.deepStrictEqual(
    invoice([{ name: 'Mug', price: '12.00', qty: 1 }, { name: 'Refund', price: '-0.50', qty: 1 }]),
    ['Mug: 12.00', 'Refund: -0.50', 'Total: 11.50'],
  );
  assert.deepStrictEqual(invoice([{ name: 'Refund', price: '-12.34', qty: 1 }]), ['Refund: -12.34', 'Total: -12.34']);
});

test('hidden: discount rounds to the nearest cent', () => {
  assert.deepStrictEqual(invoice([{ name: 'Mug', price: '19.99', qty: 1 }], 15), ['Mug: 19.99', 'Discount: -3.00', 'Total: 16.99']);
});
