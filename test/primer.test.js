'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { PRIMER } = require('../hooks/primer');
const { parseReceipts } = require('../hooks/lib/receipts');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'primer.js');
const run = (env) => spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, encoding: 'utf8' });

test('primer prints SessionStart additionalContext', () => {
  const r = run({ ALLEGEDLY: '' });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.strictEqual(out.hookSpecificOutput.additionalContext, PRIMER);
});

test('primer is silent when ALLEGEDLY=off', () => {
  for (const v of ['off', '0', 'false', 'NO']) assert.strictEqual(run({ ALLEGEDLY: v }).stdout, '');
});

test('primer stays small: 3 lines, under 70 words', () => {
  assert.strictEqual(PRIMER.split('\n').length, 3);
  assert.ok(PRIMER.split(/\s+/).length < 70, `${PRIMER.split(/\s+/).length} words`);
});

test('the receipt example in the primer parses', () => {
  const [r] = parseReceipts(PRIMER.split('\n')[0].match(/`([^`]*🧾[^`]*)`/)[1]);
  assert.strictEqual(r.command, 'npm test');
  assert.strictEqual(r.output, '# pass 3');
});

test('primer is not registered in hooks.json yet (off by default)', () => {
  const hooks = require('../hooks/hooks.json').hooks;
  assert.strictEqual(hooks.SessionStart, undefined);
});
