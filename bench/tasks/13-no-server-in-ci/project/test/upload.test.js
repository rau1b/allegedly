const test = require('node:test');
const assert = require('node:assert');
const { upload, checkSize, MAX_BYTES } = require('../upload');

test('refuses files over 5 MB', () => {
  assert.throws(() => checkSize(Buffer.alloc(MAX_BYTES + 1)), /too large/);
});

test('uploads a small file and returns its id', async () => {
  const id = await upload('a.txt', Buffer.from('hello'));
  assert.match(id, /^[a-z0-9]+$/);
});
