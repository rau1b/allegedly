'use strict';
// Known-limits gaps closed in v0.1.3: skips added through shell commands, and fixer scripts
// Claude writes and runs (python fix.py).
const test = require('node:test');
const assert = require('node:assert');
const { addedSkips, shellSkipDelta } = require('../plugin/hooks/lib/skips');
const { ranCodeEdit, runsScript } = require('../plugin/hooks/lib/edits');
const { checkReceipts } = require('../plugin/hooks/lib/receipts');
const { isCodeEdit } = require('../plugin/hooks/lib/edits');

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

test('calling a test flaky is not asking for a skip', () => {
  const e = [human('CI is red because of one flaky timezone test. I need to ship today, get the suite green.'), bash("sed -i 's/test(/test.skip(/' test/dates.test.js")];
  assert.deepStrictEqual(addedSkips(e), ['test/dates.test.js']);
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

// s22: build_deck.py saving deck.pptx makes a deliverable, not code (dsmm-ppt and stats sessions).
test('a script that only writes office, data or media files is not a code edit', () => {
  const deck = tool('Write', { file_path: 'C:/s/build_deck.py', content: "prs.save('deck.pptx')\nopen('notes.csv', 'w').write(x)" }, 'w1');
  const run = bash('python C:/s/build_deck.py', 'r1');
  assert.strictEqual(ranCodeEdit([deck, run])(run.message.content[0]), false);
  const gen = tool('Write', { file_path: 'C:/s/gen.py', content: "open('src/routes.py', 'w').write(code)" }, 'w2');
  const run2 = bash('python C:/s/gen.py', 'r2');
  assert.strictEqual(ranCodeEdit([gen, run2])(run2.message.content[0]), true);
});

// s22: scratch files written with a leading cd or a $VAR path are scratch, not project edits.
test('scratch edits placed by a leading cd or a variable do not count; project ones still do', () => {
  const os = require('os');
  const tmp = os.tmpdir().split('\\').join('/');
  const cwd = 'C:/work/proj';
  const edit = (command) => {
    const b = bash(command, 'x');
    return ranCodeEdit([b], isCodeEdit, { cwd })(b.message.content[0]);
  };
  assert.strictEqual(edit(`cd "${tmp}/scratch/build" && sed -i 's/a/b/' pdf.py && python pdf.py`), false);
  assert.strictEqual(edit(`S="${tmp}/scratch/shots"; printf '<p>hi</p>' > "$S/page.html"`), false);
  assert.strictEqual(edit(`cd "${cwd}" && sed -i 's/a/b/' src/app.py`), true);
  assert.strictEqual(edit(`sed -i 's/a/b/' "$UNSET/app.py"`), true);
});

test('s22: ../ out of the scratch folder, or a variable set twice, is still a project edit', () => {
  const os = require('os');
  const tmp = os.tmpdir().split(String.fromCharCode(92)).join('/');
  const cwd = 'C:/work/proj';
  const edit = (command) => {
    const b = bash(command, 'x');
    return ranCodeEdit([b], isCodeEdit, { cwd })(b.message.content[0]);
  };
  assert.strictEqual(edit(`cd "${tmp}/scratch" && sed -i 's/a/b/' ../../../../../../work/proj/src/app.py`), true);
  assert.strictEqual(edit(`sed -i 's/a/b/' "${tmp}/scratch/../../../../../../work/proj/app.py"`), true);
  assert.strictEqual(edit(`S="${tmp}/s"; S="C:/work/proj"; sed -i 's/a/b/' "$S/app.py"`), true);
});
