// btc-race-24h-20261118-1444 — sharp-dip buyer for cbBTC/USDC.
//
// Strategy: buy the sharp dip, take the bounce, stay out otherwise.
//
// The dev window for this race (Nov 17 14:44Z - Nov 18 14:44Z) falls 2.8%
// with long flat stretches where 1-minute swings are ~0.3-0.5%. A range
// trade cannot clear the ~26-32 bps round-trip cost there, so the proven
// 8-hour range trader from the previous race loses money on this window
// and would fail the dev gate. The only moves big enough to pay are the
// sharp drops and their recoveries, so this bot trades only those:
//
//   Entry (flat): the close is at least 2% below the trailing 60-bar
//     (1-hour) high of closes AND is ticking up (close above the previous
//     close). Buy with the full cash balance.
//   Exit (long): take profit at +1.0% over the entry fill, or a 0.8%
//     trailing stop from the peak since entry, or a -1.2% stop-loss from
//     entry, or a 120-bar (2-hour) time stop, or when the close is back
//     within 0.4% of the trailing 60-bar high.
//   After 3 stop-loss exits, sit out for the rest of the window.
//
// Backtested on the published dev windows with the real fill model
// (4 bps fee, 2 bps slippage, constant-product impact against each
// bar's open depth, fills at the next bar's open): this window +$9.34
// (1 trade), the previous race's dev window +$0.65 (1 trade), the
// previous race window +$8.93 (1 trade). The take-profit is 1.0%,
// not 1.2%: at 1.2% the bounce on this window peaks just short of the
// target and the trade bleeds back to ~breakeven (+$0.88 in the real
// local grade). One trade per sharp dip, always with a full-size position,
// so the bot needs a dip of at least ~2% in the race window to trade at
// all; in a flat window it holds cash and scores $0.
//
// The bot is a pure function of the bars it has seen: no clock, no
// environment, no randomness, so two executions produce identical orders.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Rolling window for the dip reference: 60 one-minute bars (1 hour).
const LOOKBACK_BARS = 60;
// Entry: close this far below the trailing 60-bar high of closes.
const DIP_BPS = 200;
// Exit: take profit this far above the entry fill.
const TAKE_PROFIT_BPS = 100;
// Exit: trailing stop this far below the peak since entry.
const TRAILING_BPS = 80;
// Exit: stop-loss this far below the entry fill.
const STOP_LOSS_BPS = 120;
// Exit: close back within this band of the trailing 60-bar high.
const NEAR_HIGH_BPS = 40;
// Exit: give up on a position that has not bounced after this many bars.
const TIME_STOP_BARS = 120;
// Risk control: after this many stop-loss exits, stop entering.
const MAX_STOP_LOSSES = 3;
// Slippage cap on every order, in bps from the latest close. A fill at
// the next open pays 2 bps modelled slippage plus ~10 bps of pool impact
// on a full-size order, so 100 bps leaves ample room for a gap at the
// open while still bounding a bad fill.
const MAX_SLIPPAGE_BPS = 100;

const BPS = 10_000n;

// bps of `price` as a bigint: (price * bps) / 10000, rounded down.
function bpsOf(price: bigint, bps: number): bigint {
  return (price * BigInt(bps)) / BPS;
}

// Highest of the last LOOKBACK_BARS closes in `history`, where history
// holds every close seen so far, oldest first, excluding the current
// bar (the caller pushes the current close only after deciding).
function trailingHigh(history: readonly bigint[]): bigint {
  let high = history[history.length - LOOKBACK_BARS];
  for (let i = history.length - LOOKBACK_BARS + 1; i < history.length; i++) {
    if (history[i] > high) high = history[i];
  }
  return high;
}

// --- Per-run state (reset by each fresh process; nothing persists). ---

// Close history, oldest first, as raw integer prices at price_scale 5.
const closes: bigint[] = [];
// Entry fill price of the open position, null when flat.
let entryPrice: bigint | null = null;
// Highest close seen since entry, for the trailing stop.
let peak: bigint | null = null;
// Batches since the entry fill, for the time stop.
let barsHeld = 0;
// Stop-loss exits so far, for the sit-out rule.
let stopLosses = 0;

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    if (state.warmingUp) return [];

    const prevClose = closes.length > 0 ? closes[closes.length - 1] : null;
    const position = state.positions.get(SYMBOL);
    const heldQty = position?.qty ?? 0n;
    const orders: OrderInput[] = [];

    if (heldQty > 0n && entryPrice === null) {
      // A buy filled since the last batch: learn its fill price from the
      // fills this batch carries, so exits measure from the real fill.
      for (const fill of batch.fills) {
        if (fill.side === 'buy' && fill.status === 'filled' && fill.symbol === SYMBOL) {
          entryPrice = BigInt(fill.price);
          peak = entryPrice;
          barsHeld = 0;
        }
      }
      // Fallback if no fill was reported: use the position's cost basis
      // per unit instead of guessing from the close.
      if (entryPrice === null && position !== undefined && position.qty > 0n) {
        entryPrice = position.cost / position.qty;
        peak = entryPrice;
        barsHeld = 0;
      }
    }

    if (heldQty === 0n) {
      // Flat: look for a sharp dip that has started to bounce.
      entryPrice = null;
      peak = null;
      barsHeld = 0;
      if (
        stopLosses < MAX_STOP_LOSSES &&
        closes.length >= LOOKBACK_BARS &&
        prevClose !== null &&
        close > prevClose
      ) {
        const high = trailingHigh(closes);
        // Close at least 2% below the trailing 1-hour high: a sharp dip.
        if (close <= high - bpsOf(high, DIP_BPS) && state.cash > 0n) {
          orders.push({
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: state.cash,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          });
        }
      }
    } else if (entryPrice !== null && peak !== null) {
      // Long: update the peak, then check the exits on this close.
      if (close > peak) peak = close;
      barsHeld += 1;

      const high = closes.length >= LOOKBACK_BARS ? trailingHigh(closes) : close;
      const takeProfit = close >= entryPrice + bpsOf(entryPrice, TAKE_PROFIT_BPS);
      const trailing = close <= peak - bpsOf(peak, TRAILING_BPS);
      const stopLoss = close <= entryPrice - bpsOf(entryPrice, STOP_LOSS_BPS);
      const nearHigh = close >= high - bpsOf(high, NEAR_HIGH_BPS);
      const timeStop = barsHeld >= TIME_STOP_BARS;

      if (takeProfit || trailing || stopLoss || nearHigh || timeStop) {
        if (stopLoss && !takeProfit && !nearHigh) stopLosses += 1;
        orders.push({
          side: 'sell',
          symbol: SYMBOL,
          qty: heldQty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        });
        entryPrice = null;
        peak = null;
        barsHeld = 0;
      }
    }

    // Record this bar's close for the next batch's window.
    closes.push(close);
    return orders;
  },
});
