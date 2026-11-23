# allegedly

**Claude fixed it… allegedly.**

`allegedly` makes Claude Code show receipts. Every time Claude says something works, it has to prove it with fresh, real output from your session, or admit it's only *allegedly* working and tell you how to check.

## Install

```
/plugin marketplace add rau1b/allegedly
/plugin install allegedly@allegedly
```

Enforcement needs **Node 18+** (`node --version`). Without Node, the skill still works but nothing enforces it.

![Install allegedly, then Claude fixes a bug and ends with a receipt](docs/demo.gif)

## What you get

```
● Fixed the login redirect bug and added a test.

  verified   Test passes       npm test auth → 14 passed, 0 failed
  verified   Redirect works    curl /login → 302 → /dashboard
  allegedly  Mobile layout OK  to check: open /login at 375px

  🧾 2 receipts · 1 allegedly
```

Small task? You get one line:

```
🧾 1 receipt · npm run build → compiled successfully
```

## Why it's different

Other verification skills *ask* Claude nicely. allegedly **enforces** it: a hook checks Claude's final message every time it finishes. If Claude claims success with no receipts, or with stale ones from before its last edit, it gets sent back once to fix that. If it still skips them, you see a one-line notice. It never fails silently.

## What allegedly reads

- Your current session's transcript, on your machine, and only from your last message onward.
- Sometimes one test file: when a receipt comes from a run of specific test files, it opens them (up to 256 KB each) to see whether they use the code Claude edited.
- **Nothing leaves your machine.** The hook contains no network code at all, and a test enforces that.
- It writes one thing: an empty marker file in your temp folder (`allegedly/<session id>.blocked`) while it has sent Claude back, so it never sends Claude back twice in one turn. No transcript text goes in it.
- At session start, a second small hook adds three lines to Claude's context explaining the receipt format (about 60 tokens). With it, Claude gets the format right the first time much more often, so fewer replies are sent back.
- The whole hook is a few short files in `hooks/`, readable in about ten minutes. It doesn't start other programs either.

## Headless and CI (`claude -p`, the Agent SDK)

allegedly works the same way there: it sends Claude back once, so the receipts end up in your log. If Claude misses twice, the notice shows up as an info message in `--output-format stream-json`, but plain `-p` output may not show it. `--bare` runs skip plugin hooks, so allegedly doesn't run in them.

To turn allegedly off, set `ALLEGEDLY=off`. To drop only the three session-start lines, set `ALLEGEDLY_PRIMER=off`.

## Known limits

- A receipt proves a command ran and printed that output. It doesn't prove your tests are good. allegedly does catch one common dodge: running a test for a different file than the one Claude changed. Whole-suite runs (`npm test`) are trusted as-is.
- v0.1 doesn't track edits made through shell commands (sed, formatters, git checkout).
- English only for now.

## License

MIT
