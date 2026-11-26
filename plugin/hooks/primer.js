#!/usr/bin/env node
'use strict';
// allegedly: SessionStart primer. Adds the receipt format to Claude's context once per
// session start (also after /clear or a compact, when the earlier context is gone), so Claude
// writes receipts before the Stop hook has to send it back.
//
// On by default (user decision A, s10): in the 72-run Haiku benchmark it raised proof rate
// 75% → 96% and cut send-backs 24 → 7 of 24, for ~60 tokens a session. ALLEGEDLY=off turns
// everything off; ALLEGEDLY_PRIMER=off turns off only this. Fails open like the Stop hook.

const PRIMER = [
  'allegedly is on. Before saying code works, run it after your last edit and end with a 🧾 line quoting the output: `🧾 1 receipt · npm test → # pass 3`.',
  'Reading, grepping or listing files proves nothing. Only something you ran counts: a test, build, script or request.',
  "If you couldn't run it, say so: `🧾 allegedly · <claim> · to check: <step>`.",
].join('\n');

function isOff(value) {
  return /^(?:off|0|false|no)$/i.test(String(value || '').trim());
}

function main() {
  if (isOff(process.env.ALLEGEDLY) || isOff(process.env.ALLEGEDLY_PRIMER)) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: PRIMER } }));
}

if (require.main === module) {
  try {
    main();
  } catch {
    // fail open
  }
}

module.exports = { PRIMER };
