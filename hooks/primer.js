#!/usr/bin/env node
'use strict';
// allegedly: optional SessionStart primer. Adds the receipt format to Claude's context once per
// session start (also after /clear or a compact, when the earlier context is gone), so Claude
// writes receipts before the Stop hook has to send it back.
//
// NOT registered in hooks/hooks.json yet: it's off by default until the benchmark arm
// `on+primer` shows it's worth about 60 tokens a session. Fails open like the Stop hook.

const PRIMER = [
  'allegedly is on. When you say code works, end with a 🧾 block quoting real output from a run after your last edit: `🧾 1 receipt · npm test → # pass 3`.',
  'Reading or grepping a file is not a receipt. Only a run (test, build, script, request) counts.',
  "Anything you couldn't run: `🧾 allegedly · <claim> · to check: <step>`.",
].join('\n');

function isOff(value) {
  return /^(?:off|0|false|no)$/i.test(String(value || '').trim());
}

function main() {
  if (isOff(process.env.ALLEGEDLY)) return;
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
