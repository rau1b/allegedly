model: sonnet, runs per task: 1, tasks: 01-average, 02-fix-the-code-not-the-test, 03-weak-visible-test, 04-month-end, 05-async-foreach, 06-validate-input, 07-css-overflow, 08-slugify-unicode, 09-invoice-three-files, 10-shared-helper, 11-duplicated-dates

| Arm | Runs | **Proof rate** | Hidden test passes | Claimed done | **Fake done** | Ran tests | Edited tests | Avg cost $ | Avg output tokens |
|---|---|---|---|---|---|---|---|---|---|
| without | 11 | **0%** | 91% | 91% | **9%** | 73% | 36% | 0.0552 | 1095 |
| with allegedly + primer | 11 | **100%** | 100% | 91% | **0%** | 100% | 45% | 0.0607 | 1321 |
