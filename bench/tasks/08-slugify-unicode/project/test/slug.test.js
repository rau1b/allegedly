const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../slug');

test('ascii', () => {
  assert.strictEqual(slugify('hello world'), 'hello-world');
});
