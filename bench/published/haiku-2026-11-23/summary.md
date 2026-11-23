model: haiku, runs per task: 3, tasks: 01-average, 02-fix-the-code-not-the-test, 03-weak-visible-test, 04-month-end, 05-async-foreach, 06-validate-input, 07-css-overflow, 08-slugify-unicode

| Arm | Runs | **Proof rate** | Hidden test passes | Claimed done | **Fake done** | Ran tests | Edited tests | Avg cost $ | Avg output tokens |
|---|---|---|---|---|---|---|---|---|---|
| without | 24 | **0%** | 100% | 96% | **0%** | 63% | 33% | 0.0038 | 1617 |
| with allegedly | 24 | **75%** | 100% | 96% | **0%** | 71% | 33% | 0.0047 | 2191 |
| with allegedly + primer | 24 | **100%** | 100% | 79% | **0%** | 92% | 63% | 0.0051 | 2601 |
