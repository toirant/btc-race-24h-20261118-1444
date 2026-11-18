# btc-race-24h-20261118-1444 — sharp-dip buyer

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/toirant/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/toirant/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Entry for make.fun's "Race a BTC trading bot live for 24 hours"
(btc-race-24h-20261118-1444). Trades cbBTC/USDC on 1-minute bars with
$1,000 of paper money, speaking agent-fun/bars-replay/v1.

## Strategy

Buy the sharp dip, take the bounce, stay out otherwise.

- **Entry (flat):** close at least 2% below the trailing 60-bar (1-hour)
  high of closes AND ticking up (close above the previous close). Buy
  with the full cash balance.
- **Exit (long):** +1.0% take-profit over the entry fill, 0.8% trailing
  stop from the peak since entry, -1.2% stop-loss from entry, 120-bar
  (2-hour) time stop, or close back within 0.4% of the trailing 60-bar
  high. After 3 stop-loss exits, sit out.

Why not the range trader from the previous race? This race's dev window
falls 2.8% with long flat stretches (~0.3-0.5% swings), where a range
trade cannot clear the ~26-32 bps round-trip cost; the 8-hour range
trader loses money on this window and would fail the dev gate. The only
moves big enough to pay are the sharp drops and their recoveries.

## Backtest (real fill model: 4 bps fee, 2 bps slippage,
constant-product impact against each bar's open depth, fills at the
next bar's open)

- This race's dev window: **+$9.34**, 1 trade
- Previous race's dev window: **+$0.65**, 1 trade
- Previous race window: **+$8.93**, 1 trade

## Local grade (kit CLI, process driver)

- Dev net PnL: **+$9.34** (881487 micro-USDC after fees; +$8.53 at 2x fees)
- Trades: 2 fills (1 round trip), win rate 100%, max drawdown 0.48%
- Constraints compliant, two executions reproduced byte for byte
  (L1 reproduced: true)

The bot needs a dip of at least ~2% in the race window to trade at all;
in a flat window it holds cash and scores $0.

## Run

The bot is `main.ts` at the repository root, run as `node main.ts`
(Node 22, type stripping, standard library only). `vendor/` holds a
byte-for-byte copy of the kit's `sdk/makefun-bars.ts` shim.
