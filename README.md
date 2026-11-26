# allegedly

**Claude fixed it… allegedly.**

The same bug, the same model (Sonnet), two real runs from our benchmark:

> **Without allegedly**
> I fixed the date format in `report.js`. […] **The test suite passes.**

The bug was copied into three files. Claude fixed one, and the hidden test failed.

> **With allegedly**
> The bug was copied into three places: `report.js`, `email.js` and `export.js`. I added a shared `formatDate` helper and switched all three to use it. […]
>
> 🧾 2 receipts · npm test → # pass 1 · node check → `Invoice A1 is due on 2026-03-05`, `1,2026-03-05,9`

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

Other verification skills *ask* Claude nicely. allegedly **enforces** it: a hook checks Claude's final message every time it finishes. If Claude claims success with no receipts, or with stale ones from before its last edit, it gets sent back once to fix that. If it still skips them, you see a one-line notice, so a missing receipt never slips by quietly.

## Does it work?

We ran Claude Code on 8 small bug-fix tasks, with and without allegedly. Haiku ran each task three times in three setups: without allegedly, with the hook alone, and with the hook plus the session-start lines (the default install). Sonnet ran each task once, without and with the default install.

**Proof rate** is the share of "it works" replies you can check yourself: every receipt matches real output from after the last edit, or the reply says what's unproven and how to check it.

| Model | Without | Hook only | Default install | Extra cost |
|---|---|---|---|---|
| Haiku (72 runs) | 0% | 75% | **100%** | +34% |
| Sonnet (16 runs) | 0% | — | **100%** | +13% |

Sonnet skipped the hook-only setup to save cost; the default install is what you get.

Other things that changed with the default install (Haiku):

- Claude ran the tests before saying done in 92% of runs, up from 63%.
- It added its own tests in 63% of runs, up from 33%. We read every test edit: each one added tests, and none deleted or loosened an existing one.
- It said "done" in 79% of runs, down from 96%. Each of the other runs said the fix was unproven and how to check it. Three of them were the CSS task, which can't be checked from a terminal. All of those fixes passed the hidden test.
- It got sent back for a missing receipt in 7 of 24 runs. With the hook alone, it got sent back in all 24.

On these 8 tasks, Claude fixed the bug in every run in every setup and never claimed a fix that a hidden test then failed. They don't trick current models into false "done" claims, so allegedly's job here is making the claim checkable, not making Claude smarter. In three extra tasks run once each, Sonnet without allegedly once said "the test suite passes" after fixing one of three copies of a bug; the hidden test failed. With allegedly, it fixed all three. One run proves little, but it's the failure allegedly exists for.

### How we ran it

- Each task is a tiny project with a hidden test Claude never sees. The runner scores each reply with the hook's own receipt checker.
- Runs are isolated from your own setup: `claude -p --setting-sources project,local --strict-mcp-config --permission-mode dontAsk`. One thing leaks through: the runner's global `CLAUDE.md` loads in every setup alike.
- Each prompt says which shell is in use, so Claude doesn't waste turns on denied commands.
- Haiku numbers come from an earlier wording of the session-start lines. The Sonnet run uses the current wording.
- Run it yourself: `node bench/run.js --model haiku --runs 3`. Raw runs, with local paths and plugin lists removed by `bench/scrub.js`: `bench/published/`.

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
- Skipped tests count as passing. If Claude marks a test `it.skip` and the suite prints a real pass, the receipt is accepted.
- v0.1 only sees edits made with Claude's edit tools. A change made through a shell command (sed, a formatter, `git checkout`) doesn't count as an edit, so a receipt from before it can still pass.
- English only for now.
- If the hook itself hits an error (a missing or unreadable transcript, bad input), it steps aside and lets Claude finish. It never blocks you because of its own bug.

## License

MIT
