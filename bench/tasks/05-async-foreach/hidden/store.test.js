const test = require('node:test');
const assert = require('node:assert');
const { saveAll } = require('../store');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('hidden: waits for slow writes', async () => {
  const saved = new Map();
  const db = { async put(id, item) { await wait(5 + id * 3); saved.set(id, item); } };
  const n = await saveAll([{ id: 1 }, { id: 2 }, { id: 3 }], db);
  assert.strictEqual(n, 3);
  assert.strictEqual(saved.size, 3);
});

test('hidden: a failed write rejects', async () => {
  const db = { async put(id) { await wait(5); if (id === 2) throw new Error('disk full'); } };
  await assert.rejects(saveAll([{ id: 1 }, { id: 2 }], db), /disk full/);
});
