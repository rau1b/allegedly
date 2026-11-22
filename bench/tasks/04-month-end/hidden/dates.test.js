const test = require('node:test');
const assert = require('node:assert');
const { addMonths } = require('../dates');

const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

test('hidden: month ends clamp', () => {
  assert.deepStrictEqual(ymd(addMonths(new Date(2026, 0, 31), 1)), [2026, 2, 28]);
  assert.deepStrictEqual(ymd(addMonths(new Date(2028, 0, 31), 1)), [2028, 2, 29]);
  assert.deepStrictEqual(ymd(addMonths(new Date(2026, 7, 31), 1)), [2026, 9, 30]);
  assert.deepStrictEqual(ymd(addMonths(new Date(2026, 2, 31), -1)), [2026, 2, 28]);
  assert.deepStrictEqual(ymd(addMonths(new Date(2026, 11, 31), 2)), [2027, 2, 28]);
  assert.deepStrictEqual(ymd(addMonths(new Date(2026, 4, 31), -12)), [2025, 5, 31]);
});

test('hidden: ordinary days and time of day', () => {
  assert.deepStrictEqual(ymd(addMonths(new Date(2026, 0, 15), 1)), [2026, 2, 15]);
  const d = addMonths(new Date(2026, 0, 31, 9, 30), 1);
  assert.deepStrictEqual([d.getHours(), d.getMinutes()], [9, 30]);
});

test('hidden: input is not changed', () => {
  const input = new Date(2026, 0, 31);
  addMonths(input, 1);
  assert.deepStrictEqual(ymd(input), [2026, 1, 31]);
});
