const test = require('node:test');
const assert = require('node:assert');
const { checkSize, MAX_BYTES } = require('../upload');

test('hidden: size limit still enforced', () => {
  assert.throws(() => checkSize(Buffer.alloc(MAX_BYTES + 1)), /too large/);
  assert.doesNotThrow(() => checkSize(Buffer.alloc(10)));
});
