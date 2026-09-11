/** Shapes written by the algo-trader cron into state/*.json. */

export interface Position {
  ticker: string;
  entry_price: number;
  entry_atr?: number;
  quantity: number;
  entry_date: string;
  stop_loss?: number;
  take_profit?: number;
  trailing_stop?: number;
  highest_since_entry?: number;
  invested: number;
  entry_costs: number;
  sector: string;
  partial_exit_done?: boolean;
  /**
   * Close the cron last marked this holding at, and the session it came from.
   * Absent in state files written before the cron recorded per-holding marks,
   * so every read of these must tolerate undefined.
   */
  last_price?: number;
  last_price_date?: string;
}

export interface PendingBuy {
  ticker: string;
  reference_price: number;
  quantity: number;
  reason: string;
}

export type TradeAction = 'BUY' | 'SELL' | 'PARTIAL_SELL';

export interface Trade {
  ticker: string;
  action: TradeAction;
  date: string;
  price: number;
  quantity: number;
  notional: number;
  costs: number;
  reason: string;
  pnl_gross?: number;
  pnl_net?: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  cash: number;
  invested_mtm: number;
  num_positions: number;
}

/** Raw state file as committed by the cron. */
export interface SleeveState {
  schema: string;
  cash: number;
  positions: Record<string, Position>;
  pending_buys: PendingBuy[];
  trades: Trade[];
  equity_curve: EquityPoint[];
  trial_start_date?: string;
  trial_v2_start_date?: string;
  last_rebalance_month?: string | null;
  halt_until_date?: string | null;
}

/** One sleeve after we've combined its state with config. */
export interface Sleeve {
  key: SleeveKey;
  name: string;
  rule: string;
  /** Plain-English description of what this sleeve does, shown in detail. */
  thesis: string;
  /** Shown when the sleeve holds nothing — explains why that is correct. */
  idleExplanation: string;
  capital: number;
  state: SleeveState | null;
  error?: string;
}

export interface SleeveSummary {
  equity: number;
  cash: number;
  /** Mark-to-market value of holdings, as computed by the cron. */
  invested: number;
  /** equity - capital. */
  pnl: number;
  returnPct: number;
  /** Change in equity since the previous session, or null with <2 sessions. */
  dayChange: number | null;
  dayChangePct: number | null;
  positionCount: number;
  pendingCount: number;
  exitCount: number;
  realisedPnl: number;
  costs: number;
  startedOn: string | null;
  daysRunning: number | null;
  /** Session date these figures were valued on. Null if never run. */
  valuedOn: string | null;
}

/**
 * A holding with its market value resolved.
 *
 * `marked` is false when the cron has not yet stamped a price on this
 * position, in which case `value` falls back to cost and `pnl` is null.
 * The UI must say which it is showing rather than presenting cost as value.
 */
export interface Holding {
  position: Position;
  symbol: string;
  cost: number;
  value: number;
  marked: boolean;
  markDate: string | null;
  pnl: number | null;
  pnlPct: number | null;
  daysHeld: number | null;
  /** How far price would have to fall to hit the stop, as a fraction. */
  stopDistancePct: number | null;
}

export type SleeveKey = 'momentum' | 'next50';

export interface SleeveConfig {
  key: SleeveKey;
  path: string;
  name: string;
  rule: string;
  thesis: string;
  idleExplanation: string;
  capital: number;
}

export const SLEEVE_CONFIG: readonly SleeveConfig[] = [
  {
    key: 'momentum',
    path: 'state/portfolio.json',
    name: 'Momentum',
    rule: 'Nifty 50 · top 10 · monthly',
    thesis:
      'Ranks the Nifty 50 by 12-month return, skipping the most recent month, and holds the top ten in equal weight. Rebalances once a month, and only while the index is above its 200-day average — below it, the sleeve stands in cash.',
    idleExplanation:
      'The index is below its 200-day average, so this sleeve is in cash by design. It re-enters at the first monthly rebalance after the market recovers.',
    capital: 100_000,
  },
  {
    key: 'next50',
    path: 'state/portfolio_next50.json',
    name: 'Next 50 Trend',
    rule: 'Nifty Next 50 · per-stock trend',
    thesis:
      'Judges each Nifty Next 50 stock on its own trend rather than the index. A stock is bought when it trades 2% above its 200-day average and sold when it falls 3% below, so entries and exits are independent per name.',
    idleExplanation:
      'No stock currently passes its own trend test. Capital sits in cash until one does.',
    capital: 200_000,
  },
] as const;
