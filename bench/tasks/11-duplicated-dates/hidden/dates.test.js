const test = require('node:test');
const assert = require('node:assert');
const { reportHeader } = require('../report');
const { reminderSubject } = require('../email');
const { toCsvRow } = require('../export');

const march5 = new Date(Date.UTC(2026, 2, 5));
const dec25 = new Date(Date.UTC(2026, 11, 25));

test('hidden: report header', () => {
  assert.strictEqual(reportHeader(march5), 'Report for 2026-03-05');
  assert.strictEqual(reportHeader(dec25), 'Report for 2026-12-25');
});

test('hidden: reminder email', () => {
  assert.strictEqual(reminderSubject('A-7', march5), 'Invoice A-7 is due on 2026-03-05');
});

test('hidden: csv export', () => {
  assert.strictEqual(toCsvRow({ id: 9, placedAt: march5, amount: '4.50' }), '9,2026-03-05,4.50');
  assert.strictEqual(toCsvRow({ id: 10, placedAt: dec25, amount: '1.00' }), '10,2026-12-25,1.00');
});
