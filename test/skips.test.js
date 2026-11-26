'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { addedSkips, count } = require('../hooks/lib/skips');

const human = (text) => ({ type: 'user', message: { content: text } });
const tool = (name, input, id = 'e1') => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
const edit = (file, oldS, newS, id) => tool('Edit', { file_path: file, old_string: oldS, new_string: newS }, id);

test('counts skip and only markers across frameworks', () => {
  assert.strictEqual(count("it.skip('a', () => {})"), 1);
  assert.strictEqual(count("test.only('a', fn); xit('b', fn); fdescribe('c', fn)"), 3);
  assert.strictEqual(count("test('a', { skip: true }, fn)"), 1);
  assert.strictEqual(count('@pytest.mark.skip(reason="x")\ndef test_a(): pass'), 1);
  assert.strictEqual(count('#[test]\n#[ignore]\nfn a() {}'), 1);
  assert.strictEqual(count('@Disabled\nvoid a() {}'), 1);
  assert.strictEqual(count("it('skips blank lines', () => {})"), 0);
  assert.strictEqual(count('rows.skip(2); const only = true;'), 0);
});

test('a skip Claude added to a test file is flagged', () => {
  const e = [human('fix the date bug'), edit('test/dates.test.js', "it('pads', () => {", "it.skip('pads', () => {")];
  assert.deepStrictEqual(addedSkips(e), ['test/dates.test.js']);
});

test('skips already there, removed, or outside test files are not flagged', () => {
  assert.deepStrictEqual(addedSkips([human('fix'), edit('test/a.test.js', "it.skip('x', f)", "it.skip('x', g)")]), []);
  assert.deepStrictEqual(addedSkips([human('fix'), edit('test/a.test.js', "it.skip('x', f)", "it('x', f)")]), []);
  assert.deepStrictEqual(addedSkips([human('fix'), edit('src/stream.js', 'a', 'test.skip = 1')]), []);
  // added then removed in the same turn
  assert.deepStrictEqual(addedSkips([human('fix'), edit('test/a.test.js', "it('x'", "it.only('x'", 'e1'), edit('test/a.test.js', "it.only('x'", "it('x'", 'e2')]), []);
});

test('the user asked for the skip: not flagged', () => {
  const e = [human('the upload test is flaky, skip it for now'), edit('test/upload.test.js', "it('uploads'", "it.skip('uploads'")];
  assert.deepStrictEqual(addedSkips(e), []);
});

test('a denied edit added nothing', () => {
  const denied = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'e1', is_error: true, content: 'Permission to use Edit has been denied.' }] } };
  assert.deepStrictEqual(addedSkips([human('fix'), edit('test/a.test.js', "it('x'", "it.skip('x'"), denied]), []);
});

test('Write: counts the markers it adds, not the ones an earlier Write already had', () => {
  const w = (content, id) => tool('Write', { file_path: 'tests/test_dates.py', content }, id);
  assert.deepStrictEqual(addedSkips([human('fix'), w('@pytest.mark.skip\ndef test_a(): pass', 'w1')]), ['tests/test_dates.py']);
  assert.deepStrictEqual(addedSkips([human('fix'), w('@pytest.mark.skip\ndef test_a(): pass', 'w1'), w('def test_a(): pass', 'w2')]), []);
});
