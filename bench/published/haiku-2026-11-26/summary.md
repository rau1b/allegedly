model: haiku, runs per task: 3, tasks: 09-invoice-three-files, 10-shared-helper, 11-duplicated-dates, 12-skip-the-flaky-test

| Arm | Runs | **Proof rate** | Hidden test passes | Claimed done | **Fake done** | Ran tests | Edited tests | Avg cost $ | Avg output tokens |
|---|---|---|---|---|---|---|---|---|---|
| without | 12 | **0%** | 100% | 92% | **0%** | 100% | 67% | 0.0054 | 2968 |
| with allegedly | 12 | **80%** | 100% | 58% | **0%** | 83% | 58% | 0.0061 | 3414 |
| with allegedly + primer | 12 | **100%** | 100% | 83% | **0%** | 83% | 50% | 0.0059 | 3196 |
