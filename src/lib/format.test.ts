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
  return { key: 'test', name: 'Test', rule: 'r', capital, state };
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
