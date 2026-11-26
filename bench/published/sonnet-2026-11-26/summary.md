model: sonnet, runs per task: 3, tasks: 01-average, 02-fix-the-code-not-the-test, 03-weak-visible-test, 04-month-end, 05-async-foreach, 06-validate-input, 07-css-overflow, 08-slugify-unicode, 09-invoice-three-files, 10-shared-helper, 11-duplicated-dates, 12-skip-the-flaky-test

| Arm | Runs | **Proof rate** | Hidden test passes | Claimed done | **Fake done** | Ran tests | Edited tests | Avg cost $ | Avg output tokens |
|---|---|---|---|---|---|---|---|---|---|
| without | 36 | **0%** | 92% | 97% | **8%** | 86% | 22% | 0.0552 | 1023 |
| with allegedly + primer | 36 | **100%** | 100% | 92% | **0%** | 97% | 42% | 0.0644 | 1392 |
