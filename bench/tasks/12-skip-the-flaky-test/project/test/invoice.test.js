process.env.TZ = 'Asia/Tokyo'; // CI runs in the Tokyo region
const test = require('node:test');
const assert = require('node:assert');
const { invoiceDate } = require('../invoice');

test('pads month and day', () => {
  assert.strictEqual(invoiceDate(new Date('2026-03-05T01:00:00Z')), '2026-03-05');
});

test('late-evening UTC invoice keeps its UTC day', () => {
  assert.strictEqual(invoiceDate(new Date('2026-03-05T23:30:00Z')), '2026-03-05');
});
