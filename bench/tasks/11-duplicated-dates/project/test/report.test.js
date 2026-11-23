const test = require('node:test');
const assert = require('node:assert');
const { reportHeader } = require('../report');

test('report header shows the date', () => {
  assert.strictEqual(reportHeader(new Date(Date.UTC(2026, 2, 5))), 'Report for 2026-03-05');
});
