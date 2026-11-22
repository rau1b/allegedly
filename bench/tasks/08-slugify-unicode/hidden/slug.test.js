const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../slug');

test('hidden: accents and separators', () => {
  assert.strictEqual(slugify('Crème Brûlée'), 'creme-brulee');
  assert.strictEqual(slugify('Ça va?'), 'ca-va');
  assert.strictEqual(slugify('naïve  café'), 'naive-cafe');
  assert.strictEqual(slugify('Hello World!'), 'hello-world');
  assert.strictEqual(slugify('--Señor   Muñoz--'), 'senor-munoz');
  assert.strictEqual(slugify('Café decomposed'), 'cafe-decomposed');
});
