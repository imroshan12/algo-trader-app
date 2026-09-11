import { rupees, signedPct, signedRupees, sleeveState, summarise } from './format';
import { Sleeve, SleeveState } from '../types';

/** Minimal but realistic state, shaped exactly as the cron writes it. */
function makeState(over: Partial<SleeveState> = {}): SleeveState {
  return {
    schema: 'v2',
    cash: 100_000,
    positions: {},
    pending_buys: [],
    trades: [],
    equity_curve: [],
    ...over,
  };
}

function makeSleeve(state: SleeveState | null, capital = 100_000): Sleeve {
  return {
    key: 'momentum', name: 'Test', rule: 'r', thesis: '', idleExplanation: '',
    capital, state,
  };
}

describe('rupee formatting', () => {
  it('uses Indian digit grouping, not thousands grouping', () => {
    // The whole point: ₹1,00,000 — not ₹100,000.
    expect(rupees(100_000)).toBe('₹1,00,000');
    expect(rupees(300_000)).toBe('₹3,00,000');
    expect(rupees(1_25_00_000)).toBe('₹1,25,00,000');
  });

  it('keeps the minus sign outside the symbol', () => {
    expect(rupees(-5_000)).toBe('-₹5,000');
  });

  it('signs explicitly where a delta is meant', () => {
    expect(signedRupees(1234)).toBe('+₹1,234');
    expect(signedRupees(-1234)).toBe('-₹1,234');
    expect(signedPct(2.5)).toBe('+2.50%');
    expect(signedPct(-2.5)).toBe('-2.50%');
    expect(signedPct(0)).toBe('+0.00%');
  });
});

describe('summarise — valuation source', () => {
  it('reports the mark-to-market snapshot, NOT cost basis', () => {
    // A position bought at 1000 now worth 1500. Cost basis would say the
    // portfolio is 100k; the truth (what the cron recorded) is 105k.
    const state = makeState({
      cash: 90_000,
      positions: {
        'FOO.NS': {
          ticker: 'FOO.NS', entry_price: 1_000, quantity: 10,
          entry_date: '2026-01-01', invested: 10_000, entry_costs: 12,
          sector: 'IT',
        },
      },
      equity_curve: [
        { date: '2026-01-02', equity: 105_000, cash: 90_000,
          invested_mtm: 15_000, num_positions: 1 },
      ],
    });

    const s = summarise(makeSleeve(state));
    expect(s.equity).toBe(105_000);
    expect(s.invested).toBe(15_000);   // market value, not the 10,000 paid
    expect(s.returnPct).toBeCloseTo(5.0);
    expect(s.valuedOn).toBe('2026-01-02');
  });

  it('uses the latest snapshot when several exist', () => {
    const state = makeState({
      equity_curve: [
        { date: '2026-01-01', equity: 100_000, cash: 100_000, invested_mtm: 0, num_positions: 0 },
        { date: '2026-01-02', equity: 98_000, cash: 98_000, invested_mtm: 0, num_positions: 0 },
      ],
    });
    const s = summarise(makeSleeve(state));
    expect(s.equity).toBe(98_000);
    expect(s.valuedOn).toBe('2026-01-02');
  });

  it('falls back to cash when the sleeve has never run', () => {
    const s = summarise(makeSleeve(makeState()));
    expect(s.equity).toBe(100_000);
    expect(s.returnPct).toBe(0);
    expect(s.valuedOn).toBeNull();
  });

  it('treats a missing state file as flat, not as a crash', () => {
    const s = summarise(makeSleeve(null, 200_000));
    expect(s.equity).toBe(200_000);
    expect(s.invested).toBe(0);
  });
});

describe('summarise — trade aggregation', () => {
  it('counts only exits and sums their net P&L', () => {
    const state = makeState({
      trades: [
        { ticker: 'A.NS', action: 'BUY', date: '2026-01-01', price: 100,
          quantity: 10, notional: 1_000, costs: 5, reason: 'in' },
        { ticker: 'A.NS', action: 'SELL', date: '2026-02-01', price: 120,
          quantity: 10, notional: 1_200, costs: 20, reason: 'out',
          pnl_gross: 200, pnl_net: 175 },
        { ticker: 'B.NS', action: 'PARTIAL_SELL', date: '2026-02-01', price: 90,
          quantity: 5, notional: 450, costs: 18, reason: 'out',
          pnl_gross: -50, pnl_net: -68 },
      ],
    });
    const s = summarise(makeSleeve(state));
    expect(s.exitCount).toBe(2);           // the BUY is not an exit
    expect(s.realisedPnl).toBe(107);       // 175 - 68
    expect(s.costs).toBe(43);              // every leg, including the buy
  });
});

describe('sleeveState — why a sleeve looks the way it does', () => {
  const flat = summarise(makeSleeve(makeState()));

  it('surfaces a load failure ahead of anything else', () => {
    const broken: Sleeve = { ...makeSleeve(null), error: 'boom' };
    expect(sleeveState(broken, flat).kind).toBe('error');
  });

  it('distinguishes deliberate cash from pending orders', () => {
    expect(sleeveState(makeSleeve(makeState()), flat).kind).toBe('idle');

    const queued = summarise(
      makeSleeve(makeState({
        pending_buys: [{ ticker: 'X.NS', reference_price: 10, quantity: 1, reason: 'r' }],
      })),
    );
    const st = sleeveState(makeSleeve(makeState()), queued);
    expect(st.kind).toBe('pending');
    expect(st.label).toBe('1 order queued');   // singular
  });

  it('pluralises holdings correctly', () => {
    const held = summarise(
      makeSleeve(makeState({
        positions: {
          'A.NS': { ticker: 'A.NS', entry_price: 1, quantity: 1,
            entry_date: '2026-01-01', invested: 1, entry_costs: 0, sector: 'IT' },
          'B.NS': { ticker: 'B.NS', entry_price: 1, quantity: 1,
            entry_date: '2026-01-01', invested: 1, entry_costs: 0, sector: 'IT' },
        },
      })),
    );
    expect(sleeveState(makeSleeve(makeState()), held).label).toBe('2 holdings');
  });
});

// ── Added with the holdings and chart work ──

import {
  compactRupees, daysBetween, holdingsOf, isStale, sortHoldings, toHolding, trendStrength,
} from './format';
import { Position } from '../types';

function position(over: Partial<Position> = {}): Position {
  return {
    ticker: 'ABB.NS', entry_price: 100, quantity: 10, entry_date: '2026-09-01',
    invested: 1_000, entry_costs: 1, sector: 'Capital Goods', stop_loss: 90,
    ...over,
  };
}

describe('holdings', () => {
  it('values a marked holding at its mark, not its cost', () => {
    const h = toHolding(position({ last_price: 120, last_price_date: '2026-09-10' }));
    expect(h.marked).toBe(true);
    expect(h.value).toBe(1_200);
    expect(h.cost).toBe(1_000);
    expect(h.pnl).toBe(200);
    expect(h.pnlPct).toBeCloseTo(20);
    expect(h.symbol).toBe('ABB');
  });

  it('refuses to invent P&L for a holding with no mark', () => {
    // State written before the cron stamped prices. Showing 0% here would be
    // a claim that the stock did not move.
    const h = toHolding(position());
    expect(h.marked).toBe(false);
    expect(h.value).toBe(1_000);
    expect(h.pnl).toBeNull();
    expect(h.pnlPct).toBeNull();
  });

  it('measures stop distance from the current price, preferring the trailing stop', () => {
    const h = toHolding(position({ last_price: 125, stop_loss: 90, trailing_stop: 100 }));
    expect(h.stopDistancePct).toBeCloseTo(20); // (125 - 100) / 125
  });

  it('ignores a zero stop — the trend sleeve writes 0.0 for "none"', () => {
    const h = toHolding(position({ stop_loss: 0, trailing_stop: 0 }));
    expect(h.stopDistancePct).toBeNull();
  });

  it('sorts by P&L with unmarked holdings last, not ranked as zero', () => {
    const list = [
      toHolding(position({ ticker: 'A.NS', last_price: 95 })),   // -50
      toHolding(position({ ticker: 'B.NS' })),                   // unmarked
      toHolding(position({ ticker: 'C.NS', last_price: 130 })),  // +300
    ];
    expect(sortHoldings(list, 'pnl').map((h) => h.symbol)).toEqual(['C', 'A', 'B']);
    expect(sortHoldings(list, 'name').map((h) => h.symbol)).toEqual(['A', 'B', 'C']);
  });

  it('reads positions straight off the sleeve', () => {
    const sleeve = makeSleeve(makeState({ positions: { 'ABB.NS': position() } }));
    expect(holdingsOf(sleeve)).toHaveLength(1);
  });
});

describe('day change', () => {
  it('is the difference between the last two sessions', () => {
    const s = summarise(makeSleeve(makeState({
      equity_curve: [
        { date: '2026-09-09', equity: 100_000, cash: 100_000, invested_mtm: 0, num_positions: 0 },
        { date: '2026-09-10', equity: 101_500, cash: 20_000, invested_mtm: 81_500, num_positions: 8 },
      ],
    })));
    expect(s.dayChange).toBe(1_500);
    expect(s.dayChangePct).toBeCloseTo(1.5);
    expect(s.pnl).toBe(1_500);
  });

  it('is unknown, not zero, with a single session', () => {
    const s = summarise(makeSleeve(makeState({
      equity_curve: [{ date: '2026-09-10', equity: 100_000, cash: 100_000, invested_mtm: 0, num_positions: 0 }],
    })));
    expect(s.dayChange).toBeNull();
  });
});

describe('axis labels', () => {
  it('uses lakh and crore', () => {
    expect(compactRupees(300_000)).toBe('₹3L');
    expect(compactRupees(3_000)).toBe('₹3k');
    expect(compactRupees(1_250_000)).toBe('₹12.5L');
    expect(compactRupees(25_000_000)).toBe('₹2.5Cr');
    expect(compactRupees(-4_500)).toBe('-₹4.5k');
  });
});

describe('queued-order strength', () => {
  it('parses the figure the trend sleeve writes', () => {
    expect(trendStrength('Uptrend (+23% vs SMA)')).toBe(23);
    expect(trendStrength('Uptrend (+9.5% vs SMA)')).toBe(9.5);
  });
  it('returns null for reasons that carry no such figure', () => {
    expect(trendStrength('Rank 3 of 50')).toBeNull();
  });
});

describe('staleness', () => {
  const at = (iso: string) => new Date(`${iso}T20:00:00`);

  it('does not flag an ordinary weekend', () => {
    // Valued Friday, looked at Monday evening before the run.
    expect(isStale('2026-09-04', at('2026-09-07'))).toBe(false);
  });

  it('does not flag a weekend with a Friday holiday', () => {
    expect(isStale('2026-09-03', at('2026-09-07'))).toBe(false);
  });

  it('flags a valuation that has missed several runs', () => {
    expect(isStale('2026-09-01', at('2026-09-07'))).toBe(true);
  });

  it('counts calendar days, not 24-hour periods', () => {
    expect(daysBetween('2026-09-10', new Date('2026-09-11T00:30:00'))).toBe(1);
  });
});
