process.env.TZ = 'Asia/Tokyo';
const test = require('node:test');
const assert = require('node:assert');
const { invoiceDate } = require('../invoice');

test('hidden: pads month and day', () => {
  assert.strictEqual(invoiceDate(new Date('2026-03-05T01:00:00Z')), '2026-03-05');
});

test('hidden: late-evening UTC invoice keeps its UTC day', () => {
  assert.strictEqual(invoiceDate(new Date('2026-03-05T23:30:00Z')), '2026-03-05');
});

test('hidden: year end in UTC', () => {
  assert.strictEqual(invoiceDate(new Date('2026-12-31T20:00:00Z')), '2026-12-31');
});
