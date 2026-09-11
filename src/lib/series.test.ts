import {
  availableRanges, buildChart, combineCurves, downsample, sliceByRange, Sample,
} from './series';
import { SleeveState } from '../types';

function state(points: [string, number][]): SleeveState {
  return {
    schema: 'v2',
    cash: 0,
    positions: {},
    pending_buys: [],
    trades: [],
    equity_curve: points.map(([date, equity]) => ({
      date, equity, cash: equity, invested_mtm: 0, num_positions: 0,
    })),
  };
}

function days(n: number, start = '2026-01-01', value = (i: number) => 100 + i): Sample[] {
  const t0 = new Date(start).getTime();
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(t0 + i * 86400000).toISOString().slice(0, 10),
    value: value(i),
  }));
}

describe('combineCurves', () => {
  it('counts a sleeve at its capital before its first snapshot', () => {
    // Momentum ran from 2 Sep; Next 50 only started on 10 Sep. On 2 Sep the
    // Next 50 capital was already earmarked, so the total is 3L, not 1L.
    const combined = combineCurves([
      { capital: 100_000, state: state([['2026-09-02', 100_000], ['2026-09-10', 101_000]]) },
      { capital: 200_000, state: state([['2026-09-10', 198_000]]) },
    ]);
    expect(combined).toEqual([
      { date: '2026-09-02', value: 300_000 },
      { date: '2026-09-10', value: 299_000 },
    ]);
  });

  it('carries a sleeve forward on dates it has no snapshot for', () => {
    const combined = combineCurves([
      { capital: 100, state: state([['2026-01-01', 110], ['2026-01-03', 120]]) },
      { capital: 100, state: state([['2026-01-02', 90]]) },
    ]);
    expect(combined.map((c) => c.value)).toEqual([210, 200, 210]);
  });

  it('treats an unreadable sleeve as sitting at its capital', () => {
    const combined = combineCurves([
      { capital: 100, state: state([['2026-01-01', 105]]) },
      { capital: 200, state: null },
    ]);
    expect(combined).toEqual([{ date: '2026-01-01', value: 305 }]);
  });
});

describe('buildChart', () => {
  it('measures bars from the baseline, not from zero', () => {
    const chart = buildChart(
      [{ date: 'a', value: 300_000 }, { date: 'b', value: 306_000 }, { date: 'c', value: 297_000 }],
      300_000,
    )!;
    expect(chart.bars.map((b) => b.direction)).toEqual(['flat', 'up', 'down']);
    // The largest gain reaches the top edge and the largest loss the bottom.
    expect(chart.above).toBe(6_000);
    expect(chart.below).toBe(3_000);
    expect(chart.bars[1].magnitude).toBeCloseTo(chart.baselineAt);
    expect(chart.bars[2].magnitude).toBeCloseTo(1 - chart.baselineAt);
  });

  it('gives an only-up portfolio its headroom instead of an empty lower half', () => {
    const chart = buildChart(days(5, '2026-01-01', (i) => 300_000 + i * 2_000), 300_000)!;
    expect(chart.baselineAt).toBeGreaterThan(0.8);
    // …but still keeps a margin, so the baseline is not the bottom edge.
    expect(chart.baselineAt).toBeLessThan(1);
    expect(chart.below).toBeGreaterThan(0);
  });

  it('never spans less than 2% of capital', () => {
    // A ₹40 wobble on ₹3L must not be stretched to fill the plot.
    const chart = buildChart([{ date: 'a', value: 300_000 }, { date: 'b', value: 300_040 }], 300_000)!;
    expect(chart.above + chart.below).toBeCloseTo(6_000);
    expect(chart.bars[1].magnitude).toBeCloseTo(40 / 6_000);
  });

  it('reports the real high and low', () => {
    const chart = buildChart(days(5, '2026-01-01', (i) => [10, 14, 9, 12, 11][i]), 10)!;
    expect(chart.high.value).toBe(14);
    expect(chart.low.value).toBe(9);
    expect(chart.last.value).toBe(11);
  });

  it('returns null with nothing to draw', () => {
    expect(buildChart([], 100)).toBeNull();
  });
});

describe('ranges', () => {
  it('slices by calendar window from the latest point', () => {
    const sliced = sliceByRange(days(60), '1W');
    expect(sliced[0].date).toBe('2026-02-22');
    expect(sliced[sliced.length - 1].date).toBe('2026-03-01');
  });

  it('never returns a single-point chart', () => {
    const sparse = [{ date: '2026-01-01', value: 1 }, { date: '2026-03-01', value: 2 }];
    expect(sliceByRange(sparse, '1W')).toHaveLength(2);
  });

  it('only offers ranges that would change what is shown', () => {
    expect(availableRanges(days(5))).toEqual(['ALL']);
    expect(availableRanges(days(20))).toEqual(['1W', 'ALL']);
    expect(availableRanges(days(200))).toEqual(['1W', '1M', '3M', 'ALL']);
  });
});

describe('downsample', () => {
  it('leaves short series alone', () => {
    const s = days(10);
    expect(downsample(s, 90)).toBe(s);
  });

  it('caps the count and always keeps the true latest value', () => {
    const s = days(500);
    const out = downsample(s, 90);
    expect(out.length).toBeLessThanOrEqual(91);
    expect(out[out.length - 1]).toEqual(s[s.length - 1]);
    // Order preserved.
    for (let i = 1; i < out.length; i += 1) expect(out[i].date > out[i - 1].date).toBe(true);
  });
});
