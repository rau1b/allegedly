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

// Seen live (s11): a receipt quoted in prose was parsed as a real one and flagged no-match.
test('a receipt quoted inside backticks is an example, not a receipt', () => {
  const tap = '# tests 1\n# pass 1\n# fail 0';
  const text = [
    '- **Bug fixed:** Haiku changed `i = 1` to `i = 0`, and its reply ended with `🧾 1 receipt · npm test → # pass 1`.',
    "🧾 2 receipts · sandbox `npm test` after Haiku's fix → `# pass 1` / `# fail 0` · hook replay → `hook exit=0`",
  ].join('\n');
  assert.deepStrictEqual(parseReceipts(text).map((r) => r.command), ["sandbox `npm test` after Haiku's fix", 'hook replay']);
  const entries = [editE, res(tap), res('hook exit=0')];
  assert.deepStrictEqual(checkReceipts(text, entries, isCodeEdit), []);
  // The real receipt is still checked: a wrong count is caught.
  assert.strictEqual(checkReceipts(text.replace('`# pass 1` / `# fail 0`', '`# pass 2`'), entries, isCodeEdit)[0].why, 'no-match');
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
  assert.strictEqual(checkReceipts('🧾 1 receipt · npm test → `# tests 3`, `ok 1 - slugify`', entries, isCodeEdit)[0].why, 'no-match');
  // Count spans alone are count phrases (decision 11): their order doesn't matter, their numbers do.
  assert.deepStrictEqual(checkReceipts('🧾 1 receipt · npm test → `# fail 0`, `# pass 3`', entries, isCodeEdit), []);
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

// Benchmark 04 (s10): a node -e script printed labels next to computed values. The labels
// ('orig unchanged:', '->') are in the command, the dates aren't. Was a false "forged".
test('not forged: a script prints its own labels next to computed values', () => {
  const cmd = "node -e \"const a=new Date(2026,0,31,10,30);console.log('orig unchanged:', f(a), '->', f(addMonths(a,1)), 'time kept:', ok)\"";
  const entries = [bash('a', cmd), out('a', 'orig unchanged: Sat Jan 31 2026 10:30:00 -> Sat Feb 28 2026 10:30:00 time kept: true')];
  assert.deepStrictEqual(check('`node -e` run → `orig unchanged: ... -> Sat Feb 28 2026 10:30:00 ... time kept: true`', entries), []);
});

test('still forged: a label with a number typed into a printer, next to a real value', () => {
  const entries = [bash('a', "node -e \"console.log('14 passed', run())\""), out('a', '14 passed ok')];
  assert.strictEqual(check('npm test → `14 passed` … `ok`', entries)[0].why, 'forged');
});

test('a bare allegedly line with a to-check step counts as a receipts block (decision C)', () => {
  const { hasReceiptsBlock, findClaims } = require('../hooks/lib/claims');
  const line = 'allegedly · Feb 28 is returned for Jan 31 · to check: run `node -e` with new Date(2026,0,31)';
  assert.ok(hasReceiptsBlock(`I changed addMonths.\n\n${line}`));
  assert.ok(hasReceiptsBlock(`- ${line}`));
  assert.deepStrictEqual(findClaims(line, { editedCode: true }), []); // the line itself isn't a claim
  assert.ok(!hasReceiptsBlock('It is allegedly fixed · to check later')); // prose, no line start / no step
  assert.ok(!hasReceiptsBlock('allegedly · it works')); // no to-check step
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

// Decision 11. Task 03 of the isolated benchmark: the real run printed TAP, the receipt said it in words.
const TAP03 = '  ---\n  duration_ms: 0.1266\n  ...\n1..3\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 75.4853\n';
const R03 = '`node --test test/strings.test.js` → 3 passed, 0 failed';

test('task 03: count phrases match TAP counts', () => {
  assert.deepStrictEqual(check(R03, [bash('t', 'node --test test/strings.test.js 2>&1 | tail -n 12'), out('t', TAP03)]), []);
  assert.deepStrictEqual(check('npm test → 3 tests, 3 passed', [bash('t', 'npm test'), out('t', TAP03)]), []);
});

test('count phrases: every number must match, and only fresh runs count', () => {
  const run = (text) => [bash('t', 'node --test'), out('t', text)];
  assert.strictEqual(check(R03, run(TAP03.replace('# pass 3', '# pass 2')))[0].why, 'no-match');
  assert.strictEqual(check(R03, run(TAP03.replace('# fail 0', '# fail 1')))[0].why, 'no-match');
  assert.strictEqual(check('npm test → 4 passed', run(TAP03))[0].why, 'no-match');
  // A stale run from before the edit proves nothing.
  const stale = checkReceipts(`🧾 1 receipt · ${R03}`, [bash('t', 'node --test'), out('t', TAP03), editE], isCodeEdit);
  assert.strictEqual(stale[0].why, 'no-match');
});

test('count phrases match pytest, jest and mocha summaries', () => {
  const run = (text) => [bash('t', 'npm test'), out('t', text)];
  assert.deepStrictEqual(check('pytest → 3 passed, 0 failed', run('==== 3 passed in 0.04s ====')), []);
  assert.strictEqual(check('pytest → 3 passed, 0 failed', run('==== 1 failed, 3 passed in 0.04s ====')).length, 1);
  assert.deepStrictEqual(check('npx jest → Tests: 3 passed, 3 total', run('Tests:       3 passed, 3 total\nTime: 1.2 s')), []);
  assert.deepStrictEqual(check('npx mocha → 3 passed', run('  3 passing (12ms)')), []);
  // A lone zero proves nothing: some other count must really be there.
  assert.strictEqual(check('npm test → 0 failed', run('done in 1s')).length, 1);
});

test('count phrases: only for outputs made only of counts; forgery and reads still caught', () => {
  assert.strictEqual(check('npm test → 3 passed, all edge cases fine', [bash('t', 'npm test'), out('t', TAP03)])[0].why, 'no-match');
  assert.strictEqual(check(R03, [bash('t', 'echo "# pass 3" "# fail 0"'), out('t', '# pass 3 # fail 0')])[0].why, 'forged');
  assert.strictEqual(check(R03, [call('t', 'Read', { file_path: 'test-log.txt' }), out('t', TAP03)])[0].why, 'weak');
});

// 3-run Haiku benchmark, 2026-11-23 (bench/results/2026-11-23T02-23-43-392Z). Honest replies the hook rejected.
const TAP1 = '> node --test\n\nok 1 - 10% off 200 is 180\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n';

test('3-run: TAP count lines glued into one quote (tasks 02, 05, 08)', () => {
  const run = (text) => [bash('t', 'npm test 2>&1'), out('t', text)];
  assert.deepStrictEqual(check('npm test → # tests 1 · # pass 1 · # fail 0', run(TAP1)), []);
  assert.deepStrictEqual(check('`node --test test/store.test.js` → `# pass 1, # fail 0`', run(TAP1)), []);
  const list = '🧾 1 receipt\n- `node --test test/slug.test.js` → `# tests 1 · # pass 1 · # fail 0`';
  assert.deepStrictEqual(checkReceipts(list, [editE, ...run(TAP1)], isCodeEdit), []);
  // Every number must still match.
  assert.strictEqual(check('npm test → # tests 1 · # pass 1 · # fail 0', run(TAP1.replace('# fail 0', '# fail 1'))).length, 1);
  assert.strictEqual(check('npm test → # pass 1, # fail 0, all edge cases fine', run(TAP1)).length, 1);
});

test('3-run: backticks inside a prose aside are not part of the quote (task 01)', () => {
  const r = '`npm test` → `# pass 1` · `# fail 0` (TAP output from `node --test`, run in the project directory)';
  const tail = '# tests 1\n# suites 0\n# pass 1\n# fail 0\n'; // `| tail` cut off the "> node --test" line
  assert.deepStrictEqual(check(r, [bash('t', 'npm test 2>&1 | tail -n 20'), out('t', tail)]), []);
  assert.strictEqual(check(r, [bash('t', 'npm test'), out('t', tail.replace('# fail 0', '# fail 1'))]).length, 1);
  // Parentheses inside a span are quoted text.
  assert.deepStrictEqual(parseReceipts('🧾 1 receipt · npm test → `ok 1 - adds (2ms)`')[0].quoted, ['ok 1 - adds (2ms)']);
  // An aside alone still gets checked.
  assert.deepStrictEqual(parseReceipts('🧾 1 receipt · npm test → (it printed `# pass 1`)')[0].quoted, ['# pass 1']);
});

test('3-run: an arrowless bullet under a receipts header is a note (task 08)', () => {
  const text = [
    '🧾 3 receipts',
    '- `node --test test/slug.test.js` → `# tests 1`, `# pass 1`, `# fail 0`',
    '- The earlier `node --test test/` run failed only because Node treated the directory as a file.',
  ].join('\n');
  assert.strictEqual(parseReceipts(text).length, 1);
  assert.deepStrictEqual(checkReceipts(text, [editE, bash('t', 'node --test test/slug.test.js'), out('t', TAP1)], isCodeEdit), []);
  // Only notes, no receipts: still a receipt with no output.
  assert.strictEqual(checkReceipts('🧾 2 receipts\n- I read the file.', [editE], isCodeEdit)[0].why, 'no-output');
});

test('3-run: "🧾 0 receipts · npm test not run" promises nothing (task 05)', () => {
  assert.deepStrictEqual(parseReceipts('🧾 0 receipts · `npm test` not run (Bash denied)'), []);
  assert.strictEqual(parseReceipts('🧾 0 receipts · npm test → # pass 1').length, 1);
  assert.strictEqual(parseReceipts('🧾 1 receipt · `npm test` not run')[0].why, undefined);
  assert.strictEqual(checkReceipts('🧾 1 receipt · `npm test` not run', [editE], isCodeEdit)[0].why, 'no-output');
});
