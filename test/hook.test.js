'use strict';
// End-to-end: runs the real hook script with a fake transcript, the way Claude Code would.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, '..', 'hooks', 'allegedly.js');

const human = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const say = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const edit = (file) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: file } }] },
});
const result = (out) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: out }] } });

function runHook(entries, extra = {}, stateDir, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-hook-'));
  const transcript = path.join(dir, 'session.jsonl');
  fs.writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ transcript_path: transcript, stop_hook_active: false, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, ALLEGEDLY: '', ALLEGEDLY_STATE_DIR: stateDir || path.join(dir, 'state'), ...env },
  });
  return { code: res.status, out: res.stdout ? JSON.parse(res.stdout) : null };
}

test('claim without receipts: sent back once', () => {
  const r = runHook([human('fix it'), edit('src/app.js'), result('ok'), say('Fixed the login bug.')]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out.decision, 'block');
  assert.ok(r.out.reason.split(/\s+/).length < 40, 'block message stays under 40 words');
});

test('second miss: lets Claude finish but tells the user', () => {
  const r = runHook([human('fix it'), say('Fixed the login bug.')], { stop_hook_active: true });
  assert.strictEqual(r.out.decision, undefined);
  assert.match(r.out.systemMessage, /skipped receipts/);
});

test('claim with a real, fresh receipt: silent', () => {
  const r = runHook([
    human('fix it'),
    edit('src/app.js'),
    result('ok'),
    result('> node --test\n# tests 14\n# pass 14\n# fail 0'),
    say('Fixed the login bug.\n\n🧾 1 receipt · npm test → # pass 14'),
  ]);
  assert.strictEqual(r.out, null);
});

test('invented receipt: sent back with the claim named', () => {
  const r = runHook([human('fix it'), edit('src/app.js'), result('ok'), say('Fixed it.\n\n🧾 1 receipt · npm test → 14 passed')]);
  assert.strictEqual(r.out.decision, 'block');
  assert.match(r.out.reason, /"npm test" doesn't match/);
});

test('stale receipt (output came before the last code edit): sent back', () => {
  const r = runHook([
    human('fix it'),
    result('# pass 14'),
    edit('src/app.js'),
    result('ok'),
    say('Fixed it.\n\n🧾 1 receipt · npm test → # pass 14'),
  ]);
  assert.strictEqual(r.out.decision, 'block');
});

test('docs edit after the run does not make the receipt stale', () => {
  const r = runHook([
    human('fix it'),
    edit('src/app.js'),
    result('# pass 14'),
    edit('README.md'),
    result('ok'),
    say('Fixed it.\n\n🧾 1 receipt · npm test → # pass 14'),
  ]);
  assert.strictEqual(r.out, null);
});

const shell = (command, id) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] },
});
const shellResult = (id, out, isError = false) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: out }] },
});
const PASS_RECEIPT = 'Fixed it.\n\n🧾 1 receipt · npm test → # pass 14';

test('shell edit after the run (sed -i) makes the receipt stale', () => {
  const r = runHook([
    human('fix it'),
    edit('src/app.js'),
    result('# pass 14'),
    shell("sed -i 's/floor/round/' src/app.js", 's1'),
    shellResult('s1', ''),
    say(PASS_RECEIPT),
  ]);
  assert.strictEqual(r.out.decision, 'block');
  assert.match(r.out.reason, /since your last code edit/);
});

test('a denied shell edit changed nothing: receipt stays fresh', () => {
  const r = runHook([
    human('fix it'),
    edit('src/app.js'),
    result('# pass 14'),
    shell("cat > scratch/app.js <<'EOF'\nold code\nEOF", 's1'),
    shellResult('s1', "Permission to use Bash has been denied because Claude Code is running in don't ask mode.", true),
    say(PASS_RECEIPT),
  ]);
  assert.strictEqual(r.out, null);
});

test('a run that saves its output to a log is not an edit', () => {
  const r = runHook([
    human('fix it'),
    edit('src/app.js'),
    result('# pass 14'),
    shell('node scripts/report.js > report.log 2>&1', 's1'),
    shellResult('s1', ''),
    say(PASS_RECEIPT),
  ]);
  assert.strictEqual(r.out, null);
});

test('tests switched off this turn: a passing receipt is sent back, file named', () => {
  const skip = {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'test/dates.test.js', old_string: "it('pads', () => {", new_string: "it.skip('pads', () => {" } }] },
  };
  const r = runHook([human('fix it'), edit('src/dates.js'), skip, result('# pass 14'), say(PASS_RECEIPT)]);
  assert.strictEqual(r.out.decision, 'block');
  assert.match(r.out.reason, /switched tests off.*dates\.test\.js/);
  assert.match(r.out.reason, /allegedly · <claim> · to check: <step>/);
  assert.ok(r.out.reason.split(/\s+/).length < 40, 'under 40 words');
  const asked = runHook([human('the dates test is flaky, skip it'), edit('src/dates.js'), skip, result('# pass 14'), say(PASS_RECEIPT)]);
  assert.strictEqual(asked.out, null);
});

test('bad receipt on the second try: lets Claude finish, tells the user', () => {
  const r = runHook([human('x'), say('Fixed.\n\n🧾 1 receipt · npm test → 99 passed')], { stop_hook_active: true });
  assert.strictEqual(r.out.decision, undefined);
  assert.match(r.out.systemMessage, /didn't check out/);
});

test('all-allegedly block: silent', () => {
  const r = runHook([human('x'), edit('src/a.js'), result('ok'), say("Fixed it.\n\n🧾 allegedly · didn't run it · to check: npm test")]);
  assert.strictEqual(r.out, null);
});

test('bad-receipt message stays under 40 words plus the claim', () => {
  const r = runHook([human('x'), say('Fixed.\n\n🧾 1 receipt · npm test → 99 passed')]);
  const words = r.out.reason.replace(/"[^"]*"/, '').split(/\s+/).length;
  assert.ok(words < 40, `got ${words} words`);
});

test('no claim: silent', () => {
  const r = runHook([human('explain'), say('This works by caching the token. Want me to change it?')]);
  assert.strictEqual(r.out, null);
});

test('dodge after a code edit is caught; after a docs-only edit it is not', () => {
  assert.strictEqual(runHook([human('x'), edit('src/a.js'), result('ok'), say('Updated the handler.')]).out.decision, 'block');
  assert.strictEqual(runHook([human('x'), edit('README.md'), result('ok'), say('Updated the readme.')]).out, null);
});

test('prefers last_assistant_message when Claude Code provides it', () => {
  const r = runHook([human('x'), say('old text')], { last_assistant_message: 'All tests pass now.' });
  assert.strictEqual(r.out.decision, 'block');
});

test('fails open on a missing transcript or bad input', () => {
  const missing = spawnSync(process.execPath, [HOOK], { input: '{"transcript_path":"/no/such/file"}', encoding: 'utf8' });
  assert.strictEqual(missing.status, 0);
  assert.strictEqual(missing.stdout, '');
  const garbage = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(garbage.status, 0);
  assert.strictEqual(garbage.stdout, '');
});

test('forged and weak receipts: sent back with their own short messages', () => {
  const tool = (id, name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
  const res = (id, out) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: out }] } });
  const forged = runHook([human('x'), edit('src/a.js'), result('ok'), tool('e', 'Bash', { command: 'echo "14 passed"' }), res('e', '14 passed'), say('Fixed.\n\n🧾 1 receipt · npm test → 14 passed')]);
  assert.match(forged.out.reason, /printed yourself/);
  const weak = runHook([human('x'), edit('src/a.js'), result('ok'), tool('l', 'Bash', { command: 'ls src' }), res('l', 'a.js'), say('Done.\n\n🧾 1 receipt · ls → a.js')]);
  assert.match(weak.out.reason, /reading or listing files/);
  for (const r of [forged, weak]) assert.ok(r.out.reason.replace(/"[^"]*"/, '').split(/\s+/).length < 40);
});

// #7: another plugin's Stop hook also sets stop_hook_active. Our one block must still happen.
test('another hook blocked first: we still send Claude back once, then notify', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-state-'));
  const turn = [human('fix it'), edit('src/app.js'), result('ok'), say('Fixed the login bug.')];
  const sid = { session_id: 'abc-123', stop_hook_active: true };
  assert.strictEqual(runHook(turn, sid, state).out.decision, 'block', 'first block is ours even though stop_hook_active');
  assert.match(runHook(turn, sid, state).out.systemMessage, /skipped receipts/, 'second miss notifies');
});

test('a new turn forgets the last block', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-state-'));
  const turn = [human('fix it'), edit('src/app.js'), result('ok'), say('Fixed the login bug.')];
  assert.strictEqual(runHook(turn, { session_id: 's1' }, state).out.decision, 'block');
  assert.ok(runHook(turn, { session_id: 's1', stop_hook_active: true }, state).out.systemMessage);
  assert.strictEqual(runHook(turn, { session_id: 's1' }, state).out.decision, 'block', 'next turn blocks again');
});

test('sessions are tracked separately', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-state-'));
  const turn = [human('fix it'), edit('src/app.js'), result('ok'), say('Fixed the login bug.')];
  runHook(turn, { session_id: 'one' }, state);
  assert.strictEqual(runHook(turn, { session_id: 'two', stop_hook_active: true }, state).out.decision, 'block');
});

test('state cannot be saved: never loops, falls back to notifying', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-state-'));
  const notADir = path.join(dir, 'file');
  fs.writeFileSync(notADir, 'x'); // a file where the folder should be, so writes fail
  const turn = [human('fix it'), edit('src/app.js'), result('ok'), say('Fixed the login bug.')];
  const r = runHook(turn, { session_id: 'abc', stop_hook_active: true }, notADir);
  assert.strictEqual(r.out.decision, undefined);
  assert.ok(r.out.systemMessage);
});

test('session id with path characters stays inside the state folder', () => {
  const { stateFile } = require('../hooks/lib/state');
  const f = stateFile('../../etc/passwd');
  assert.ok(!path.basename(f).includes('/') && !f.includes('..'));
});

// #22: a receipt from a test that doesn't touch the edited files.
test('receipt from an unrelated targeted test: sent back, edited file named', () => {
  const tool = (id, name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
  const res = (id, out) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: out }] } });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-cwd-'));
  fs.mkdirSync(path.join(cwd, 'test'));
  fs.writeFileSync(path.join(cwd, 'test', 'math.test.js'), "const add = require('../src/add');\n");
  const turn = (cmd) => [
    human('fix login'),
    edit('src/auth.js'),
    result('ok'),
    tool('r', 'Bash', { command: cmd }),
    res('r', '# pass 3'),
    say('Fixed login.\n\n🧾 1 receipt · tests → # pass 3'),
  ];
  const off = runHook(turn('node --test test/math.test.js'), { cwd });
  assert.strictEqual(off.out.decision, 'block');
  assert.match(off.out.reason, /don't touch what you edited \(auth\.js\)/);
  assert.ok(off.out.reason.replace(/"[^"]*"/, '').split(/\s+/).length < 40);
  assert.strictEqual(runHook(turn('node --test test/auth.test.js'), { cwd }).out, null, 'matching test passes');
  assert.strictEqual(runHook(turn('npm test'), { cwd }).out, null, 'whole suite passes');
});

// #25a: ALLEGEDLY=off turns the hook off (CI, or anyone who wants a break).
test('ALLEGEDLY=off: silent even on a turn that would be blocked', () => {
  const turn = [human('fix it'), edit('src/app.js'), result('ok'), say('Fixed the login bug.')];
  for (const v of ['off', 'OFF', '0', 'false', 'no']) {
    assert.strictEqual(runHook(turn, {}, undefined, { ALLEGEDLY: v }).out, null, v);
  }
  assert.strictEqual(runHook(turn, {}, undefined, { ALLEGEDLY: 'on' }).out.decision, 'block', 'any other value keeps it on');
});

// Seen live (Haiku, 2026-11-23): sent back, it ran a check, then replied "the fix is confirmed"
// in a free-form "🧾 **Receipt**" section. No claim words, no real block. It must not pass.
test('after our block, a reply with no valid block gets the notice even without claim words', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-state-'));
  const first = [human('fix it'), edit('src/app.js'), result('ok'), say('Fixed the bug.')];
  assert.strictEqual(runHook(first, { session_id: 'live1' }, state).out.decision, 'block');
  const dodge = [...first, result('{"a":2.5}'), say('🧾 **Receipt**\n\n{"a":2.5}\n\nThe fix is confirmed for the inputs above.')];
  const r = runHook(dodge, { session_id: 'live1', stop_hook_active: true }, state);
  assert.match(r.out.systemMessage, /skipped receipts/);
});

test('block message shows the format and stays under 40 words', () => {
  const r = runHook([human('x'), edit('src/a.js'), result('ok'), say('Fixed it.')]);
  assert.match(r.out.reason, /🧾 1 receipt · npm test → 14 passed/);
  assert.ok(r.out.reason.split(/\s+/).length < 40, `${r.out.reason.split(/\s+/).length} words`);
});

// Seen in the isolated benchmark (Haiku, task 07): told only "mark it allegedly", it invented
// `· rendered at 375px: not run`. Every send-back must spell out the allegedly form.
test('every send-back message spells out the allegedly form', () => {
  const form = /allegedly · <claim> · to check: <step>/;
  const noBlock = runHook([human('x'), edit('src/a.js'), result('ok'), say('Fixed it.')]);
  assert.match(noBlock.out.reason, form);
  const bad = runHook([human('x'), edit('src/a.js'), result('ok'), say('Fixed.\n\n🧾 1 receipt · npm test → 99 passed')]);
  assert.match(bad.out.reason, form);
});
