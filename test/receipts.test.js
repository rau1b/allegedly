'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseReceipts, checkReceipts } = require('../hooks/lib/receipts');

const editBlock = { type: 'tool_use', name: 'Edit', input: { file_path: 'src/a.js' } };
const isCodeEdit = (b) => b === editBlock;
const editE = { type: 'assistant', message: { content: [editBlock] } };
const res = (content) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content }] } });

test('parses compact and table receipts, skips allegedly rows and the footer', () => {
  const text = [
    '🧾 1 receipt · npm test → 14 passed',
    "🧾 allegedly · didn't run it · to check: npm run build",
    '  verified   Test passes       npm test auth → 14 passed, 0 failed',
    '  verified   Redirect works    curl /login → 302 → /dashboard',
    '  allegedly  Mobile layout OK  to check: open /login at 375px',
    '  🧾 2 receipts · 1 allegedly',
  ].join('\n');
  const r = parseReceipts(text);
  assert.deepStrictEqual(
    r.map((x) => [x.claim, x.command, x.output]),
    [
      [null, 'npm test', '14 passed'],
      ['Test passes', 'npm test auth', '14 passed, 0 failed'],
      ['Redirect works', 'curl /login', '302 → /dashboard'],
    ]
  );
});

test('matches ignoring case, whitespace, colour codes and backticks', () => {
  const entries = [editE, res('\x1b[32mTests:   14  Passed\x1b[0m, 0 failed')];
  assert.deepStrictEqual(checkReceipts('🧾 1 receipt · npm test → `tests: 14 passed, 0 failed`', entries, isCodeEdit), []);
});

test('tool_result content given as an array of text parts', () => {
  const entries = [editE, res([{ type: 'text', text: 'compiled successfully in 2.1s' }])];
  assert.deepStrictEqual(checkReceipts('🧾 1 receipt · npm run build → compiled successfully', entries, isCodeEdit), []);
});

// Real receipts from the benchmark (Haiku, session 5). All honest, all wrongly rejected before.
const TAP = '> node --test\n\nTAP version 13\nok 1 - slugify\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0';
for (const receipt of [
  '🧾 1 receipt · `npm test` → `# pass 3` / `# fail 0` (exit code 0)',
  '🧾 1 receipt · npm test → `# tests 3` · `# pass 3` · `# fail 0`',
  '🧾 1 receipt · `npm test` → `# tests 3`, `# pass 3`, `# fail 0`',
  '🧾 1 receipt · `npm test` → `# pass 3`, and every case matched',
]) {
  test(`backticked fragments are the quote, the glue between them is not: ${receipt}`, () => {
    assert.deepStrictEqual(checkReceipts(receipt, [editE, res(TAP)], isCodeEdit), []);
  });
}

test('backticked fragments must still all be real, and in order', () => {
  const entries = [editE, res(TAP)];
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → `# pass 3`, `# fail 1`', entries, isCodeEdit)[0].why, 'no-match');
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → `# fail 0`, `# pass 3`', entries, isCodeEdit)[0].why, 'no-match');
});

test('one compact line can hold several receipts, each checked on its own', () => {
  const line = '🧾 2 receipts · `node --test` → `# pass 3`, `# fail 0` · `node -e "…slugify(\'Crème\')"` → `creme`';
  assert.deepStrictEqual(
    parseReceipts(line).map((r) => [r.command, r.quoted]),
    [
      ['`node --test`', ['# pass 3', '# fail 0']],
      ['`node -e "…slugify(\'Crème\')"`', ['creme']],
    ]
  );
  assert.deepStrictEqual(checkReceipts(line, [editE, res(TAP), res('creme\n')], isCodeEdit), []);
  const bad = checkReceipts(line, [editE, res(TAP)], isCodeEdit);
  assert.deepStrictEqual(bad.map((b) => b.quoted), [['creme']]);
});

test('an allegedly part on a compact receipts line is not a receipt', () => {
  const line = "🧾 1 receipt · npm test → `# pass 3` · allegedly · didn't open it · to check: load /";
  assert.deepStrictEqual(parseReceipts(line).map((r) => r.quoted), [['# pass 3']]);
  assert.deepStrictEqual(checkReceipts(line, [editE, res(TAP)], isCodeEdit), []);
});

test('ellipsis skips text, but pieces must be in order and in the same result', () => {
  const entries = [editE, res('# tests 14\n# pass 14\n# fail 0'), res('unrelated')];
  assert.deepStrictEqual(checkReceipts('🧾 1 receipt · npm test → tests 14 … fail 0', entries, isCodeEdit), []);
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → fail 0 … tests 14', entries, isCodeEdit).length, 1);
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → tests 14 … unrelated', entries, isCodeEdit).length, 1);
});

test('receipt with no arrow or too little output is rejected as no-output', () => {
  const entries = [editE, res('ok 1 - login works')]; // "ok" is only part of the output
  assert.strictEqual(checkReceipts('🧾 1 receipt · ran the tests', entries, isCodeEdit)[0].why, 'no-output');
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → ok', entries, isCodeEdit)[0].why, 'no-output');
});

test('only output after the last code edit counts', () => {
  const entries = [res('# pass 14'), editE, res('The file has been updated.')];
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → # pass 14', entries, isCodeEdit)[0].why, 'no-match');
});

test('one good and one bad receipt: only the bad one is reported', () => {
  const entries = [editE, res('# pass 14')];
  const text = ['  verified   Tests pass   npm test → # pass 14', '  verified   Build ok     npm run build → compiled', '  🧾 2 receipts · 0 allegedly'].join('\n');
  const bad = checkReceipts(text, entries, isCodeEdit);
  assert.deepStrictEqual(bad.map((b) => b.claim), ['Build ok']);
});

// --- Where the output came from (risks 6 and 19) ---
const call = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
const out = (id, content) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } });
const bash = (id, command) => call(id, 'Bash', { command });
const check = (receipt, entries) => checkReceipts(`🧾 1 receipt · ${receipt}`, [editE, ...entries], isCodeEdit);

test('real test run: passes', () => {
  assert.deepStrictEqual(check('npm test → # pass 14', [bash('a', 'npm test'), out('a', '# pass 14\n# fail 0')]), []);
});

test('forged: echo of the receipt text', () => {
  assert.strictEqual(check('npm test → 14 passed', [bash('a', 'echo "14 passed"'), out('a', '14 passed')])[0].why, 'forged');
});

test('forged: echo chained after a real run still forged when only the echo matches', () => {
  const entries = [bash('a', 'npm test; echo "All 14 tests passed"'), out('a', '# fail 3\nAll 14 tests passed')];
  assert.strictEqual(check('npm test → all 14 tests passed', entries)[0].why, 'forged');
});

test('forged: python print and PowerShell Write-Output', () => {
  assert.strictEqual(check('pytest → 9 passed', [bash('a', 'python -c "print(\'9 passed\')"'), out('a', '9 passed')])[0].why, 'forged');
  const ps = [call('a', 'PowerShell', { command: "Write-Output 'Build succeeded'" }), out('a', 'Build succeeded')];
  assert.strictEqual(check('dotnet build → build succeeded', ps)[0].why, 'forged');
});

test('not forged: receipt text in the command of a real run with no printer', () => {
  const entries = [bash('a', 'npm test -- --grep "login redirects"'), out('a', '✔ login redirects (5ms)')];
  assert.deepStrictEqual(check('npm test → login redirects', entries), []);
});

test('forged copy plus a real run of the same output: passes on the real run', () => {
  const entries = [bash('a', 'echo "# pass 14"'), out('a', '# pass 14'), bash('b', 'npm test'), out('b', '# pass 14')];
  assert.deepStrictEqual(check('npm test → # pass 14', entries), []);
});

// Isolated benchmark, task 07: Haiku quoted a grep and one span (`nowrap`) wasn't in it.
// "Re-quote it" was the wrong advice: nothing had been run since the edit.
test('no match when only reads happened since the edit: weak, not no-match', () => {
  const grep = [call('a', 'Grep', { pattern: 'width' }), out('a', 'styles.css:16: width: 100%;')];
  assert.strictEqual(check('grep → `16: width: 100%;` (no `nowrap`)', grep)[0].why, 'weak');
  const ran = [...grep, bash('b', 'node check.js'), out('b', 'cta=16..359')];
  assert.strictEqual(check('node check.js → cta=0..400', ran)[0].why, 'no-match');
});

test('weak: output only from ls, cat, git status or the Read tool', () => {
  assert.strictEqual(check('ls → app.js', [bash('a', 'ls src'), out('a', 'app.js\nutil.js')])[0].why, 'weak');
  assert.strictEqual(check('cat → 14 passed', [bash('a', 'cat test.log | tail -3'), out('a', '14 passed')])[0].why, 'weak');
  assert.strictEqual(check('git → working tree clean', [bash('a', 'cd repo && git status'), out('a', 'nothing to commit, working tree clean')])[0].why, 'weak');
  assert.strictEqual(check('read → return token', [call('a', 'Read', { file_path: 'a.js' }), out('a', '12  return token;')])[0].why, 'weak');
});

test('not weak: a real run piped through a display command', () => {
  assert.deepStrictEqual(check('npm test → # pass 14', [bash('a', 'npm test 2>&1 | tail -5'), out('a', '# pass 14')]), []);
  assert.deepStrictEqual(check('curl → 302', [bash('a', 'curl -s -o /dev/null -w "%{http_code}" localhost/login'), out('a', '302')]), []);
});

test('isReadOnlyCommand', () => {
  const { isReadOnlyCommand } = require('../hooks/lib/receipts');
  for (const c of ['ls -la', 'cat a.txt', 'FOO=1 grep x f', 'cd x && ls', 'Get-Content log.txt | Select-String pass', 'git diff HEAD', '/usr/bin/head -5 f']) {
    assert.strictEqual(isReadOnlyCommand(c), true, c);
  }
  for (const c of ['npm test', 'node app.js', 'cd x && pytest', 'cargo build | tail', 'git commit -m x', 'cd x']) {
    assert.strictEqual(isReadOnlyCommand(c), false, c);
  }
});

// The examples in SKILL.md are what Claude copies. They must parse the way the hook expects.
test('every receipt example in SKILL.md parses, with command and output', () => {
  const fs = require('fs');
  const path = require('path');
  const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'allegedly', 'SKILL.md'), 'utf8');
  const blocks = [...skill.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  const receipts = blocks.flatMap((b) => parseReceipts(b));
  assert.ok(receipts.length >= 5, `found ${receipts.length}`);
  for (const r of receipts) {
    assert.ok(r.command && r.output.length >= 3, `bad example: ${r.line}`);
  }
});

// Seen live (2026-11-23): a run printed exactly "4" and Claude quoted it. Honest, must pass.
test('short output passes only when it is the whole output of a run', () => {
  const run = (out) => [
    { type: 'assistant', message: { content: [editBlock] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'n', name: 'Bash', input: { command: 'node -e "x"' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'n', content: out }] } },
  ];
  assert.deepStrictEqual(checkReceipts('🧾 1 receipt · node -e → `4`', run('4\n'), isCodeEdit), []);
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → ok', run('# tests 3\nok 1 - a\n'), isCodeEdit)[0].why, 'no-output');
  assert.strictEqual(checkReceipts('🧾 1 receipt · node -e → 5', run('4\n'), isCodeEdit)[0].why, 'no-output');
});

// Isolated benchmark, 2026-11-23. Both are honest replies the parser used to misread.
const TAP3 = 'TAP version 13\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n';

test('task 01: output in a fenced block under the receipt line', () => {
  const text = 'Fixed.\n\n🧾 1 receipt · `npm test` →\n```\n# tests 3\n# pass 3\n# fail 0\n```\n\nThe receipt covers the existing test only.';
  const [r] = parseReceipts(text);
  assert.deepStrictEqual(r.quoted, ['# tests 3', '# pass 3', '# fail 0']);
  assert.deepStrictEqual(checkReceipts(text, [editE, res(TAP3)], isCodeEdit), []);
  assert.strictEqual(checkReceipts(text, [editE, res('# tests 3\n# pass 2\n# fail 1')], isCodeEdit)[0].why, 'no-match');
});

test('task 08: receipts as a list under a header line', () => {
  const text = [
    '🧾 2 receipts',
    '- `node --test` → `# tests 3`, `# pass 3`, `# fail 0`',
    '- `node -e "...slugify(\'Crème Brûlée\')..."` → `"creme-brulee"`',
    '',
    'Not checked: letters with no decomposition.',
  ].join('\n');
  assert.strictEqual(parseReceipts(text).length, 2);
  assert.deepStrictEqual(checkReceipts(text, [editE, res(TAP3), res('"creme-brulee"\n')], isCodeEdit), []);
  assert.strictEqual(checkReceipts(text, [editE, res(TAP3)], isCodeEdit)[0].why, 'no-match');
});

test('a list may mix in allegedly items; a header with no list is a receipt with no output', () => {
  const list = '🧾 1 receipt\n- npm test → # pass 3\n- allegedly · works on Safari · to check: open it in Safari';
  assert.strictEqual(parseReceipts(list).length, 1);
  const empty = parseReceipts('Done.\n\n🧾 2 receipts\n\nAll good.');
  assert.strictEqual(empty.length, 1);
  assert.strictEqual(checkReceipts('Done.\n\n🧾 2 receipts', [editE, res(TAP3)], isCodeEdit)[0].why, 'no-output');
});
