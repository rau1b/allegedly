'use strict';
// Known-limits gaps closed in v0.1.3: skips added through shell commands, and fixer scripts
// Claude writes and runs (python fix.py).
const test = require('node:test');
const assert = require('node:assert');
const { addedSkips, shellSkipDelta } = require('../hooks/lib/skips');
const { ranCodeEdit, runsScript } = require('../hooks/lib/edits');
const { checkReceipts } = require('../hooks/lib/receipts');
const { isCodeEdit } = require('../hooks/lib/edits');

const human = (text) => ({ type: 'user', message: { content: text } });
const tool = (name, input, id) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, text) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] } });
const bash = (command, id = 'b1') => tool('Bash', { command }, id);

test('shellSkipDelta: the pattern side of a substitution counts against', () => {
  assert.strictEqual(shellSkipDelta("sed -i 's/it(/it.skip(/' test/a.test.js"), 1);
  assert.strictEqual(shellSkipDelta("sed -i 's/it\\.skip(/it(/' test/a.test.js"), -1);
  assert.strictEqual(shellSkipDelta("sed -i 's|^def test_x|@pytest.mark.skip\\ndef test_x|' tests/test_a.py"), 1);
  assert.strictEqual(shellSkipDelta("(Get-Content a.test.js) -replace '\\bit\\(', 'it.skip(' | Set-Content a.test.js"), 1);
  assert.strictEqual(shellSkipDelta("(Get-Content a.test.js) -replace 'it\\.only\\(', 'it(' | Set-Content a.test.js"), -1);
  assert.strictEqual(shellSkipDelta('npm test'), 0);
});

test('a skip added with sed -i is flagged', () => {
  const e = [human('fix the date bug'), bash("sed -i 's/it(.pads/it.skip(\"pads/' test/dates.test.js")];
  assert.deepStrictEqual(addedSkips(e), ['test/dates.test.js']);
});

test('a skip removed with sed, or added to a non-test file, is not flagged', () => {
  assert.deepStrictEqual(addedSkips([human('fix'), bash("sed -i 's/it\\.skip(/it(/' test/a.test.js")]), []);
  assert.deepStrictEqual(addedSkips([human('fix'), bash("sed -i 's/x/test.skip/' src/stream.js")]), []);
});

test('a sed skip the user asked for is not flagged', () => {
  assert.deepStrictEqual(addedSkips([human('skip the flaky upload test'), bash("sed -i 's/it(/it.skip(/' test/upload.test.js")]), []);
});

const fixer = (content) => tool('Write', { file_path: 'C:/proj/fix.py', content }, 'w1');

test('running a file-writing script Claude wrote this turn is an edit', () => {
  const w = fixer("for f in files:\n    open(f, 'w').write(new)\n");
  const run = bash('python fix.py', 'r1');
  assert.strictEqual(ranCodeEdit([w, run])(run.message.content[0]), true);
  for (const cmd of ['python3 -u ./fix.py', 'cd /c/proj && python fix.py', 'py C:/proj/fix.py']) {
    assert.strictEqual(runsScript(bash(cmd).message.content[0], ['c:/proj/fix.py']), true, cmd);
  }
});

test('not an edit: a script that only prints, reading the script, or a script already in the project', () => {
  const printer = fixer("print('hello')\n");
  const run = bash('python fix.py', 'r1');
  assert.strictEqual(ranCodeEdit([printer, run])(run.message.content[0]), false);
  const writer = fixer("open('a.py', 'w').write('x')\n");
  const cat = bash('cat fix.py', 'r2');
  assert.strictEqual(ranCodeEdit([writer, cat])(cat.message.content[0]), false);
  const other = bash('python scripts/gen.py', 'r3');
  assert.strictEqual(ranCodeEdit([writer, other])(other.message.content[0]), false);
});

test('a receipt from before the fixer script ran is stale; one after it passes', () => {
  const entries = [
    human('fix the imports'),
    tool('Write', { file_path: 'fix.js', content: "fs.writeFileSync(f, out)" }, 'w1'),
    result('w1', 'File created'),
    bash('npm test', 't1'),
    result('t1', '# pass 9\n# fail 0'),
    bash('node fix.js', 'f1'),
    result('f1', 'rewrote 4 files'),
  ];
  const text = 'Fixed the imports.\n\n🧾 1 receipt · npm test → `# pass 9`';
  assert.strictEqual(checkReceipts(text, entries, isCodeEdit).length, 1);
  const after = [...entries, bash('npm test', 't2'), result('t2', '# pass 9\n# fail 0')];
  assert.strictEqual(checkReceipts(text, after, isCodeEdit).length, 0);
});
