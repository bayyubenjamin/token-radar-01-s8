# token-radar-01-s8

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bayyubenjamin/token-radar-01-s8/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bayyubenjamin/token-radar-01-s8/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar S8 — the fitted-odds board. Every value term is fitted from the protocols' own record: the comps curve (ln mcap on ln TVL, a=6.9646, b=0.5223, R²=0.1939) and the Weibull launch odds (λ=889d, k=0.48, held-out log-loss 0.656 vs 0.799 assumed) are both fit from the sealed snapshot, tested held-out, walk-forward and leave-one-out. The board ranks 198 pre-token protocols: 40 FARM / 106 THIN / 52 SKIP. Rank 1 is Sentora Curator — and it is SKIP, honestly, because 55,152 farmers dilute the share to $19.08 against a $258 cost.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=bayybays&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
