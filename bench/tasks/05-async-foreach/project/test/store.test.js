const test = require('node:test');
const assert = require('node:assert');
const { saveAll } = require('../store');

test('saves every item', async () => {
  const saved = new Map();
  const db = { async put(id, item) { saved.set(id, item); } };
  const n = await saveAll([{ id: 1 }, { id: 2 }], db);
  assert.strictEqual(n, 2);
  assert.strictEqual(saved.size, 2);
});
