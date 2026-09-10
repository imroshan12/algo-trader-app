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
}

export interface PendingBuy {
  ticker: string;
  reference_price: number;
  quantity: number;
  reason: string;
}

export interface Trade {
  ticker: string;
  action: 'BUY' | 'SELL' | 'PARTIAL_SELL';
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
}

/** One sleeve after we've combined its state with config and computed totals. */
export interface Sleeve {
  key: string;
  name: string;
  rule: string;
  capital: number;
  state: SleeveState | null;
  error?: string;
}

export interface SleeveSummary {
  equity: number;
  cash: number;
  /** Mark-to-market value of holdings, as computed by the cron. */
  invested: number;
  returnPct: number;
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

export const SLEEVE_CONFIG = [
  {
    key: 'momentum',
    path: 'state/portfolio.json',
    name: 'Momentum',
    rule: 'Nifty 50 · top 10 · monthly',
    capital: 100_000,
  },
  {
    key: 'next50',
    path: 'state/portfolio_next50.json',
    name: 'Next 50 Trend',
    rule: 'Nifty Next 50 · per-stock trend',
    capital: 200_000,
  },
] as const;
