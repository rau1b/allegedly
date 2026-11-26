#!/usr/bin/env node
'use strict';
// allegedly: the Stop hook. Runs each time Claude finishes a turn.
// It fails open: on any error it exits 0 with no output, so Claude finishes normally.

const path = require('path');
const { readRecentEntries } = require('./lib/transcript');
const { findClaims, hasReceiptsBlock } = require('./lib/claims');
const { checkReceipts } = require('./lib/receipts');
const { weBlocked, markBlocked, clearBlocked } = require('./lib/state');
const { isCodeEdit, ranCodeEdit } = require('./lib/edits');
const { humanText } = require('./lib/skips');

// Includes the format: the skill may not have loaded, so this can be Claude's only instruction.
// The allegedly form is spelled out too: told only "or mark it allegedly", Haiku invented
// its own (`· rendered at 375px: not run`, isolated benchmark run, 2026-11-23).
const ALLEGEDLY_FORM = '`allegedly · <claim> · to check: <step>`';
const MSG_NO_BLOCK =
  'allegedly: you claimed it works but showed no receipts. End with a 🧾 block quoting real output, like ' +
  `\`🧾 1 receipt · npm test → 14 passed\`. Anything you couldn't run: ${ALLEGEDLY_FORM}.`;
const MSG_SECOND_MISS = 'allegedly: Claude skipped receipts this turn, treat its claims as unverified';
const MSG_SECOND_BAD = "allegedly: Claude's receipts didn't check out this turn, treat its claims as unverified";

// Under 40 words plus the claim (tested).
function badReceiptMessage(r) {
  const what = r.claim ? `"${r.claim}"` : `"${r.command || r.line}"`;
  if (r.why === 'forged') {
    return `allegedly: the receipt for ${what} quotes text you printed yourself. Run the real check and quote its output, or mark it ${ALLEGEDLY_FORM}.`;
  }
  if (r.why === 'weak') {
    return `allegedly: the receipt for ${what} comes from reading or listing files, which doesn't prove it works. Run a test, build or request, or mark it ${ALLEGEDLY_FORM}.`;
  }
  if (r.why === 'unrelated') {
    const names = (r.edited || []).slice(0, 2).map((f) => path.basename(f)).join(', ');
    return `allegedly: the receipt for ${what} ran tests that don't touch what you edited (${names}). Run tests that cover it, or mark it ${ALLEGEDLY_FORM}.`;
  }
  if (r.why === 'skipped') {
    const names = (r.files || []).slice(0, 2).map((f) => path.basename(f)).join(', ');
    return `allegedly: you switched tests off this turn (skip or only in ${names}), so a passing run proves less. Turn them back on and re-run, or mark it ${ALLEGEDLY_FORM}.`;
  }
  if (r.why === 'no-output') {
    return `allegedly: the receipt for ${what} quotes no output. Write it as command → output line, copied from a real run, or mark it ${ALLEGEDLY_FORM}.`;
  }
  return `allegedly: the receipt for ${what} doesn't match any output since your last code edit. Re-run it and quote the real output, or mark it ${ALLEGEDLY_FORM}.`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function blocks(entry) {
  const content = entry && entry.message && entry.message.content;
  return Array.isArray(content) ? content : [];
}

// Text of Claude's final message: assistant text after the last tool result.
function finalAssistantText(entries) {
  let lastToolResult = -1;
  entries.forEach((e, i) => {
    if (e.type === 'user' && blocks(e).some((b) => b && b.type === 'tool_result')) lastToolResult = i;
  });
  return entries
    .slice(lastToolResult + 1)
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => blocks(e).filter((b) => b && b.type === 'text').map((b) => b.text))
    .join('\n');
}

// True if Claude edited a code file this turn (an edit tool or a shell command that writes code).
function editedCodeThisTurn(entries) {
  const ran = ranCodeEdit(entries);
  return entries.some((e) => e.type === 'assistant' && blocks(e).some(ran));
}

// ALLEGEDLY=off (also 0, false, no; any case) turns the hook off, e.g. in CI.
function switchedOff() {
  return /^(?:off|0|false|no)$/i.test(String(process.env.ALLEGEDLY || '').trim());
}

async function main() {
  if (switchedOff()) return;
  const input = JSON.parse((await readStdin()) || '{}');
  if (!input.transcript_path) return;
  if (!input.stop_hook_active) clearBlocked(input.session_id); // a new stop cycle

  const { entries, human } = readRecentEntries(input.transcript_path);
  const text = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : finalAssistantText(entries);

  let reason, notice;
  if (hasReceiptsBlock(text)) {
    // A block is there: every `verified` receipt must quote fresh output.
    const bad = checkReceipts(text, entries, isCodeEdit, { cwd: input.cwd, request: human ? humanText([human]) : '' });
    if (bad.length === 0) return;
    reason = badReceiptMessage(bad[0]);
    notice = MSG_SECOND_BAD;
  } else {
    // Once we sent Claude back, the claim is already on record: the reply owes a block
    // even if it avoids claim words this time ("the fix is confirmed", seen in a live run).
    const owed = input.stop_hook_active && weBlocked(input.session_id) === true;
    const claims = findClaims(text, { editedCode: editedCodeThisTurn(entries) });
    if (claims.length === 0 && !owed) return;
    reason = MSG_NO_BLOCK;
    notice = MSG_SECOND_MISS;
  }

  const out = alreadySentBack(input)
    ? { systemMessage: notice } // already sent back once: let it finish, but tell the user
    : { decision: 'block', reason };
  process.stdout.write(JSON.stringify(out));
}

// Did allegedly already send Claude back in this stop cycle?
// stop_hook_active alone can't say: another plugin's Stop hook also sets it.
// Records our block when it says no. Falls back to stop_hook_active when the
// session can't be tracked, so it can never block forever.
function alreadySentBack(input) {
  const sid = input.session_id;
  if (!input.stop_hook_active) {
    markBlocked(sid);
    return false;
  }
  const ours = weBlocked(sid);
  if (ours === null) return true; // no session id: old behaviour
  if (ours) return true;
  // Another hook sent Claude back, not us. Take our one block, if it can be recorded.
  return !markBlocked(sid);
}

main()
  .catch(() => {})
  .then(() => process.exit(0));
