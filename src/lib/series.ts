/**
 * Turning equity curves into something drawable.
 *
 * The chart plots deviation from deployed capital rather than absolute
 * equity, because that is the question being asked: a ₹3,00,000 portfolio
 * sitting at ₹3,00,400 is visually indistinguishable from flat on an
 * absolute axis, and the whole point of looking is to see whether the money
 * has moved.
 *
 * The baseline sits wherever the data puts it. A portfolio that has only
 * ever been up gets a plot that is mostly headroom above the line, not one
 * with an empty lower half reserved for losses that never happened. A thin
 * margin is always kept on the quiet side, so the baseline never sits on an
 * edge where it would be mistaken for the frame.
 *
 * The plot never spans less than 2% of capital top to bottom. Without that
 * floor, the first day of a fresh portfolio — where the largest deviation
 * might be a few rupees — would be auto-scaled until noise filled the plot
 * and looked like a rally. The bounds are always labelled, so the scale is
 * never left to be guessed.
 */

import { SleeveState } from '../types';

export interface Sample {
  date: string;
  value: number;
}

export interface ChartBar {
  date: string;
  value: number;
  deviation: number;
  /** Bar length as a fraction (0–1) of the full plot height, from the baseline. */
  magnitude: number;
  direction: 'up' | 'down' | 'flat';
}

export interface ChartModel {
  bars: ChartBar[];
  baseline: number;
  /** Rupees above the baseline that the top edge of the plot represents. */
  above: number;
  /** Rupees below the baseline that the bottom edge represents. */
  below: number;
  /** Where the baseline sits, as a fraction of plot height from the top. */
  baselineAt: number;
  high: Sample;
  low: Sample;
  first: Sample;
  last: Sample;
}

/** Smallest top-to-bottom extent of the plot, as a fraction of capital. */
const MIN_EXTENT_FRACTION = 0.02;
/** Margin kept on the side of the baseline the data never reaches. */
const QUIET_SIDE_FRACTION = 0.12;

/**
 * Sum several sleeves into one curve.
 *
 * Sleeves do not start on the same day. Before a sleeve's first snapshot its
 * capital is already earmarked but idle, so it contributes its full capital
 * — which is what makes the combined curve start flat at total deployed
 * rather than stepping up as each sleeve comes online. On a date where a
 * sleeve has no snapshot, its last known equity carries forward.
 */
export function combineCurves(
  sleeves: readonly { capital: number; state: SleeveState | null }[],
): Sample[] {
  const dates = new Set<string>();
  for (const sleeve of sleeves) {
    for (const point of sleeve.state?.equity_curve ?? []) dates.add(point.date);
  }
  const ordered = Array.from(dates).sort();
  if (ordered.length === 0) return [];

  const cursor = sleeves.map(() => 0);
  const carried = sleeves.map((s) => s.capital);

  return ordered.map((date) => {
    let total = 0;
    sleeves.forEach((sleeve, i) => {
      const curve = sleeve.state?.equity_curve ?? [];
      while (cursor[i] < curve.length && curve[cursor[i]].date <= date) {
        carried[i] = curve[cursor[i]].equity;
        cursor[i] += 1;
      }
      total += carried[i];
    });
    return { date, value: total };
  });
}

export function curveOf(state: SleeveState | null): Sample[] {
  return (state?.equity_curve ?? []).map((p) => ({ date: p.date, value: p.equity }));
}

// ── Ranges ──

export const RANGES = ['1W', '1M', '3M', 'ALL'] as const;
export type Range = (typeof RANGES)[number];

const WINDOW_DAYS: Record<Range, number | null> = {
  '1W': 7,
  '1M': 30,
  '3M': 91,
  ALL: null,
};

export function sliceByRange(samples: Sample[], range: Range): Sample[] {
  const days = WINDOW_DAYS[range];
  if (days === null || samples.length === 0) return samples;

  const end = new Date(samples[samples.length - 1].date).getTime();
  if (Number.isNaN(end)) return samples;

  const cutoff = end - days * 86400000;
  const kept = samples.filter((s) => new Date(s.date).getTime() >= cutoff);
  // A single bar is not a chart. Fall back rather than render something
  // that cannot show a trend.
  return kept.length >= 2 ? kept : samples.slice(-2);
}

/**
 * Only offer ranges that would actually show something different.
 *
 * A fortnight of history has no meaningful 3M view — the button would be
 * live, tappable, and change nothing, which reads as a broken control.
 */
export function availableRanges(samples: Sample[]): Range[] {
  const out: Range[] = [];
  for (const range of RANGES) {
    if (range === 'ALL') continue;
    if (sliceByRange(samples, range).length < samples.length) out.push(range);
  }
  out.push('ALL');
  return out;
}

// ── Chart model ──

export function buildChart(samples: Sample[], baseline: number): ChartModel | null {
  if (samples.length === 0) return null;

  let maxUp = 0;
  let maxDown = 0;
  for (const s of samples) {
    const d = s.value - baseline;
    if (d > maxUp) maxUp = d;
    if (-d > maxDown) maxDown = -d;
  }

  const floor = Math.abs(baseline) * MIN_EXTENT_FRACTION || 1;
  const margin = Math.max(maxUp + maxDown, floor) * QUIET_SIDE_FRACTION;
  let above = Math.max(maxUp, margin);
  let below = Math.max(maxDown, margin);
  // Stretch to the floor proportionally, so enforcing a minimum scale never
  // moves the baseline away from where the data put it.
  if (above + below < floor) {
    const k = floor / (above + below);
    above *= k;
    below *= k;
  }
  const extent = above + below;

  const bars: ChartBar[] = samples.map((s) => {
    const deviation = s.value - baseline;
    return {
      date: s.date,
      value: s.value,
      deviation,
      magnitude: Math.min(Math.abs(deviation) / extent, 1),
      direction: deviation > 0 ? 'up' : deviation < 0 ? 'down' : 'flat',
    };
  });

  let high = samples[0];
  let low = samples[0];
  for (const s of samples) {
    if (s.value > high.value) high = s;
    if (s.value < low.value) low = s;
  }

  return {
    bars,
    baseline,
    above,
    below,
    baselineAt: above / extent,
    high,
    low,
    first: samples[0],
    last: samples[samples.length - 1],
  };
}

/**
 * Cap how many bars a chart has to draw.
 *
 * Daily snapshots accumulate indefinitely; at a few hundred points the bars
 * are narrower than the gaps between them and the chart turns to grain.
 * Buckets are contiguous and the last sample of each is kept, so the final
 * bar is always the real latest value rather than an average that would
 * disagree with the headline figure.
 */
export function downsample(samples: Sample[], maxPoints: number): Sample[] {
  if (maxPoints < 2 || samples.length <= maxPoints) return samples;

  const out: Sample[] = [];
  const step = samples.length / maxPoints;
  for (let i = 0; i < maxPoints; i += 1) {
    const end = Math.min(samples.length - 1, Math.floor((i + 1) * step) - 1);
    const pick = samples[Math.max(end, Math.floor(i * step))];
    if (pick && out[out.length - 1] !== pick) out.push(pick);
  }
  const last = samples[samples.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
