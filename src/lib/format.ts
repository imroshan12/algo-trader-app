/**
 * Formatting and derived numbers.
 *
 * Amounts use Indian digit grouping (₹1,00,000 rather than ₹100,000) because
 * that is how these figures read on any NSE broker statement.
 *
 * On valuation: the cron marks the portfolio to market with real closing
 * prices and records the result in `equity_curve`, and stamps each holding
 * with the price it was marked at. Those are the authoritative figures and
 * this module reads them directly. It deliberately does NOT recompute value
 * from `entry_price` — that yields cost basis, not market value. Where a mark
 * is genuinely missing, the derived `Holding` says so via `marked: false`
 * rather than quietly presenting cost as though it were value.
 */

import {
  Holding, Position, Sleeve, SleeveState, SleeveSummary,
} from '../types';

// ── Money and percentages ──

export function rupees(n: number, decimals = 0): string {
  const abs = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${n < 0 ? '-' : ''}₹${abs}`;
}

export function signedRupees(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-IN');
  return `${n >= 0 ? '+' : '-'}₹${abs}`;
}

export function signedPct(n: number, decimals = 2): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

/**
 * Short form for chart axes, where a full ₹3,00,000 will not fit.
 * Lakh and crore rather than K and M — these are rupee amounts.
 */
export function compactRupees(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${sign}₹${trimZeros(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trimZeros(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trimZeros(abs / 1e3)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

function trimZeros(v: number): string {
  return v.toFixed(2).replace(/\.?0+$/, '');
}

// ── Dates ──

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'unknown';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

// ── Sleeve summary ──

function startDate(state: SleeveState): string | null {
  return state.trial_start_date ?? state.trial_v2_start_date ?? null;
}

const emptySummary = (capital: number): SleeveSummary => ({
  equity: capital,
  cash: capital,
  invested: 0,
  pnl: 0,
  returnPct: 0,
  dayChange: null,
  dayChangePct: null,
  positionCount: 0,
  pendingCount: 0,
  exitCount: 0,
  realisedPnl: 0,
  costs: 0,
  startedOn: null,
  daysRunning: null,
  valuedOn: null,
});

export function summarise(sleeve: Sleeve): SleeveSummary {
  const state = sleeve.state;
  if (!state) return emptySummary(sleeve.capital);

  const positions = Object.values(state.positions ?? {});
  const trades = state.trades ?? [];
  const exits = trades.filter(
    (t) => t.action === 'SELL' || t.action === 'PARTIAL_SELL',
  );

  // The cron's most recent snapshot is the authoritative valuation: computed
  // against real closing prices at the end of that session.
  const curve = state.equity_curve ?? [];
  const snapshot = curve[curve.length - 1];
  const previous = curve[curve.length - 2];

  const cash = snapshot?.cash ?? state.cash ?? sleeve.capital;
  const invested = snapshot?.invested_mtm ?? 0;
  const equity = snapshot?.equity ?? cash + invested;

  const dayChange =
    snapshot && previous ? snapshot.equity - previous.equity : null;

  return {
    equity,
    cash,
    invested,
    pnl: equity - sleeve.capital,
    returnPct: ((equity - sleeve.capital) / sleeve.capital) * 100,
    dayChange,
    dayChangePct:
      dayChange !== null && previous && previous.equity > 0
        ? (dayChange / previous.equity) * 100
        : null,
    positionCount: positions.length,
    pendingCount: (state.pending_buys ?? []).length,
    exitCount: exits.length,
    realisedPnl: exits.reduce((a, t) => a + (t.pnl_net ?? 0), 0),
    costs: trades.reduce((a, t) => a + (t.costs ?? 0), 0),
    startedOn: startDate(state),
    daysRunning: daysSince(startDate(state)),
    valuedOn: snapshot?.date ?? null,
  };
}

// ── Holdings ──

export function symbolOf(ticker: string): string {
  return ticker.replace(/\.(NS|BO)$/, '');
}

function isUsablePrice(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export function toHolding(position: Position): Holding {
  const cost = position.quantity * position.entry_price;
  const marked = isUsablePrice(position.last_price);
  const price = marked ? (position.last_price as number) : position.entry_price;
  const value = position.quantity * price;

  const stop = isUsablePrice(position.trailing_stop)
    ? (position.trailing_stop as number)
    : isUsablePrice(position.stop_loss)
      ? (position.stop_loss as number)
      : null;

  return {
    position,
    symbol: symbolOf(position.ticker),
    cost,
    value,
    marked,
    markDate: position.last_price_date ?? null,
    pnl: marked ? value - cost : null,
    pnlPct: marked && cost > 0 ? ((value - cost) / cost) * 100 : null,
    daysHeld: daysSince(position.entry_date),
    // Measured against the price we would actually be stopped out from.
    stopDistancePct: stop !== null && price > 0 ? ((price - stop) / price) * 100 : null,
  };
}

export function holdingsOf(sleeve: Sleeve): Holding[] {
  return Object.values(sleeve.state?.positions ?? {}).map(toHolding);
}

export type HoldingSort = 'value' | 'pnl' | 'name';

export function sortHoldings(holdings: Holding[], by: HoldingSort): Holding[] {
  const out = holdings.slice();
  switch (by) {
    case 'name':
      return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
    case 'pnl':
      // Unmarked holdings have no P&L to rank on; keep them together at the
      // bottom rather than treating "unknown" as zero and interleaving them.
      return out.sort((a, b) => {
        if (a.pnl === null && b.pnl === null) return b.value - a.value;
        if (a.pnl === null) return 1;
        if (b.pnl === null) return -1;
        return b.pnl - a.pnl;
      });
    case 'value':
    default:
      return out.sort((a, b) => b.value - a.value);
  }
}

// ── Sleeve status ──

export type SleeveStateKind = 'live' | 'pending' | 'idle' | 'halted' | 'error';

/**
 * Why is this sleeve where it is? Encoded as state so the UI can show a chip
 * rather than making the reader infer intent from a zero.
 */
export function sleeveState(
  sleeve: Sleeve,
  summary: SleeveSummary,
): { kind: SleeveStateKind; label: string } {
  if (sleeve.error) return { kind: 'error', label: 'Could not load' };
  if (summary.positionCount > 0) {
    const n = summary.positionCount;
    return { kind: 'live', label: `${n} holding${n === 1 ? '' : 's'}` };
  }
  if (summary.pendingCount > 0) {
    const n = summary.pendingCount;
    return { kind: 'pending', label: `${n} order${n === 1 ? '' : 's'} queued` };
  }
  const halt = sleeve.state?.halt_until_date;
  if (halt && halt > new Date().toISOString().slice(0, 10)) {
    return { kind: 'halted', label: 'Trading halted' };
  }
  return { kind: 'idle', label: 'Holding cash' };
}

// ── Queued orders ──

/**
 * How far above its 200-day average a queued stock was, parsed from the
 * reason the cron wrote ("Uptrend (+23% vs SMA)"). Returns null for any
 * reason that doesn't carry that figure — the momentum sleeve writes
 * different reasons, and an unparseable one must not render as 0%.
 */
export function trendStrength(reason: string): number | null {
  const m = /([+-]?\d+(?:\.\d+)?)%\s*vs\s*SMA/i.exec(reason);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

export function queuedNotional(pending: readonly { quantity: number; reference_price: number }[]): number {
  return pending.reduce((a, q) => a + q.quantity * q.reference_price, 0);
}

// ── Freshness ──

/**
 * The cron runs every weekday evening. A valuation older than this many
 * calendar days means runs have been missed, not merely that it is a
 * weekend: Friday → Monday evening is 3, and a Friday holiday makes it 4.
 */
export const STALE_AFTER_DAYS = 4;

export function daysBetween(fromIso: string, to: Date = new Date()): number | null {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

export function isStale(valuedOn: string | null, now: Date = new Date()): boolean {
  if (!valuedOn) return false;
  const d = daysBetween(valuedOn, now);
  return d !== null && d > STALE_AFTER_DAYS;
}
