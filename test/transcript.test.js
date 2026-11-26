'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readRecentEntries } = require('../hooks/lib/transcript');

const human = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
const toolResult = (out) =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: out }] } });
const assistant = (text) =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });

function writeTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-'));
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

test('stops at the last human message and returns only the current turn', () => {
  const file = writeTranscript([human('old'), assistant('old reply'), human('fix the bug'), assistant('a'), assistant('b')]);
  const { entries, complete } = readRecentEntries(file);
  assert.strictEqual(complete, true);
  assert.deepStrictEqual(entries.map((e) => e.message.content[0].text), ['a', 'b']);
});

test('tool results are not mistaken for the human message', () => {
  const file = writeTranscript([human('run tests'), assistant('running'), toolResult('14 passed'), assistant('done')]);
  const { entries } = readRecentEntries(file);
  assert.strictEqual(entries.length, 3);
});

test('skips corrupt or half-written lines', () => {
  const file = writeTranscript([human('go'), '{not json', assistant('ok'), '{"type":"assist']);
  const { entries } = readRecentEntries(file);
  assert.strictEqual(entries.length, 1);
});

test('stitches lines across chunk boundaries, including multi-byte characters', () => {
  const file = writeTranscript([human('go'), assistant('🧾 1 receipt · npm test → 14 passed'), assistant('second')]);
  const { entries } = readRecentEntries(file, { chunkSize: 7 });
  assert.strictEqual(entries[0].message.content[0].text, '🧾 1 receipt · npm test → 14 passed');
  assert.strictEqual(entries.length, 2);
});

test('100k-line session: current turn is read in under 0.2 s', () => {
  const lines = [human('start')];
  for (let i = 0; i < 100000; i++) lines.push(i % 2 ? assistant(`step ${i}`) : toolResult(`output ${i}`));
  lines.push(human('latest request'));
  for (let i = 0; i < 20; i++) lines.push(assistant(`reply ${i}`));
  const file = writeTranscript(lines);

  const t0 = process.hrtime.bigint();
  const { entries, complete } = readRecentEntries(file);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  assert.strictEqual(complete, true);
  assert.strictEqual(entries.length, 20);
  assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
});

test('huge turn with no human message nearby: stops at the 2 MB cap, quickly', () => {
  const lines = [human('start')];
  for (let i = 0; i < 100000; i++) lines.push(toolResult(`output line ${i} `.repeat(5)));
  const file = writeTranscript(lines);
  assert.ok(fs.statSync(file).size > 4 * 1024 * 1024, 'fixture should be bigger than the cap');

  const t0 = process.hrtime.bigint();
  const { complete } = readRecentEntries(file);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  assert.strictEqual(complete, false);
  assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
});

// A background task finishing (run_in_background) arrives as a plain user message, not isMeta.
// Seen in real transcripts (Claude Code 2.1): origin.kind 'task-notification'. It isn't the person.
test('a background-task notification is not the human message', () => {
  const notice = (extra) => JSON.stringify({ type: 'user', ...extra, message: { role: 'user', content: '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>' } });
  for (const extra of [{ origin: { kind: 'task-notification' } }, {}]) {
    const file = writeTranscript([human('fix the bug'), assistant('a'), notice(extra), assistant('b')]);
    const { entries, human: h } = readRecentEntries(file);
    assert.strictEqual(h.message.content, 'fix the bug');
    assert.strictEqual(entries.length, 3);
  }
});

test('a typed message with origin human still ends the turn', () => {
  const typed = JSON.stringify({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: 'now fix the other one' } });
  const file = writeTranscript([human('fix the bug'), assistant('a'), typed, assistant('b')]);
  assert.strictEqual(readRecentEntries(file).entries.length, 1);
});
