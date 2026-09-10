/**
 * Formatting and derived numbers.
 *
 * Amounts use Indian digit grouping (₹1,00,000 rather than ₹100,000) because
 * that is how these figures read on any NSE broker statement.
 *
 * On valuation: the cron marks the portfolio to market with real closing
 * prices and records the result in `equity_curve`. That snapshot is the
 * authoritative valuation and this module reads it directly. It deliberately
 * does NOT recompute equity from `entry_price` — that would yield cost basis,
 * not market value, and would misreport every held position.
 */

import { Sleeve, SleeveState, SleeveSummary } from '../types';

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

export function signedPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'unknown';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 0) return 'just now';
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function startDate(state: SleeveState): string | null {
  return state.trial_start_date ?? state.trial_v2_start_date ?? null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

const emptySummary = (capital: number): SleeveSummary => ({
  equity: capital,
  cash: capital,
  invested: 0,
  returnPct: 0,
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

  // The cron's most recent snapshot is the authoritative valuation: it was
  // computed against real closing prices at the end of that session.
  const snapshot = state.equity_curve?.[state.equity_curve.length - 1];

  const cash = snapshot?.cash ?? state.cash ?? sleeve.capital;
  const invested = snapshot?.invested_mtm ?? 0;
  const equity = snapshot?.equity ?? cash + invested;

  return {
    equity,
    cash,
    invested,
    returnPct: ((equity - sleeve.capital) / sleeve.capital) * 100,
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

/**
 * Why is this sleeve where it is? Encoded as state so the UI can show a chip
 * rather than making the reader infer intent from a zero.
 */
export function sleeveState(
  sleeve: Sleeve,
  summary: SleeveSummary,
): { kind: 'live' | 'pending' | 'idle' | 'error'; label: string } {
  if (sleeve.error) return { kind: 'error', label: 'Could not load' };
  if (summary.positionCount > 0) {
    const n = summary.positionCount;
    return { kind: 'live', label: `${n} holding${n === 1 ? '' : 's'}` };
  }
  if (summary.pendingCount > 0) {
    const n = summary.pendingCount;
    return { kind: 'pending', label: `${n} order${n === 1 ? '' : 's'} queued` };
  }
  return { kind: 'idle', label: 'Holding cash' };
}
