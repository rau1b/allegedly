---
name: allegedly
description: Use whenever you are about to tell the user that something works, is fixed, passes, is done, or "should be working". Every such claim must carry a fresh receipt (real output from this session) or be openly marked allegedly.
---

# allegedly

Whenever your reply says code you changed this turn works ("fixed", "works", "tests pass", "done", "should be working now", even hedged), end the reply with a receipts block. Plain answers, explanations, questions and plans get no block, and neither do turns where you changed no code (research, documents, slide decks, copying files).

## Rules

1. **A receipt is real output, quoted.** Copy the proving line from a tool run in this session. Never paraphrase it, never invent it, and never produce it with `echo`/`printf` or by printing a file you wrote yourself.
2. **Fresh only.** The run must come after your last edit to the code it proves. If you edited after running it, run it again or mark the claim allegedly.
3. **Relevant only.** The command must exercise the claim (the test, the build, a request to the endpoint). `ls` or `cat` proves nothing works. If you only read files this turn, you have no receipts: use the allegedly line alone.
4. **Verify when it's cheap.** If a test, build or run command exists and takes about a minute or less, run it. Don't mark the claim allegedly to skip the work.
5. **Otherwise say allegedly.** Any claim you didn't verify gets `allegedly` plus one concrete step the user can take to check it. Never leave a claim out of the block.

## Format

One claim, compact:

```
🧾 1 receipt · npm test auth → 14 passed, 0 failed
```

```
🧾 allegedly · didn't run it · to check: npm run build
```

Two or more claims, a table:

```
  verified   Test passes       npm test auth → 14 passed, 0 failed
  verified   Redirect works    curl /login → 302 → /dashboard
  allegedly  Mobile layout OK  to check: open /login at 375px

  🧾 2 receipts · 1 allegedly
```

- Use words, not icons. 🧾 is the only emoji. No ✅, ⚠️ or similar.
- Keep the claim to a few words. Write the receipt as `command → key output line`, with the output copied character for character. Put notes in (parentheses) or after the block, never in the quoted output.
- Several receipts on one line are separated by ` · `: `🧾 2 receipts · pytest -q → 69 passed · ruff check → All checks passed!`
- What you checked by looking (a screenshot, a rendered slide, a page in a browser) is not a receipt, because there's no output to quote. Put it in an allegedly line with the check for the user.
- The footer is always exactly `🧾 N receipts · M allegedly`. Use the singular "receipt" when N is 1.

## When the terminal can't prove it

Visual changes, deploys, emails, payments and other people's services often can't be proven from here. Split the claim:

- **Receipt the part you can.** The build compiles, the page returns 200 (`curl -sI <url>`), the deploy command printed the live URL, the email function's test passed. If a browser tool is available, quote text from its result (page text, a console line). A screenshot alone has no text to quote.
- **Mark the rest allegedly with a check the user can do in under a minute.** Name the exact place, the action and what they should see:

```
  verified   Build passes      npm run build → compiled successfully
  verified   Page is up        curl -sI /pricing → HTTP/2 200
  allegedly  Mobile layout OK  to check: open /pricing at 375px wide, the plan cards stack in one column

  🧾 2 receipts · 1 allegedly
```

Too vague: "check it in the browser", "verify the deploy". Good: "open https://app.example.com/login, sign in, you land on /dashboard". Good: "send a test signup, the welcome email arrives within a minute, subject 'Welcome'".

## If you're sent back

The allegedly hook may return your reply with a short reason. Fix the block: run the check, or mark the claim allegedly. Don't argue, and don't resend the same reply.
