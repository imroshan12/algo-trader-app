/**
 * Equity chart.
 *
 * Bars measure deviation from deployed capital, growing up or down from a
 * baseline at the middle of the plot. Each bar is one trading session, which
 * is what the data actually is — drawing a smooth line through daily closes
 * would imply values between them that were never observed.
 *
 * The detailed chart has a readout and can be scrubbed: drag across it to
 * read any session. The gesture is only claimed once movement is clearly
 * horizontal, so a vertical flick still scrolls the page behind it; a chart
 * that traps the scroll is worse than one that doesn't scrub. The compact
 * form is a plain sparkline — it lives inside a card that is itself a
 * button, and two gestures competing for one touch is a bug either way.
 *
 * Drawn with plain Views rather than a drawing library. It keeps the app free
 * of native dependencies, and a column chart is exactly what a stack of
 * flex-sized Views is good at.
 */

import React, { useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { makeStyles, mono, radius, space, tabular, type, useTheme } from '../theme';
import { compactRupees, rupees, shortDate, signedRupees } from '../lib/format';
import { ChartBar, ChartModel } from '../lib/series';

interface Props {
  model: ChartModel;
  height?: number;
  /** Adds the readout, scrubbing, axis rail and value bounds. */
  detailed?: boolean;
  /** Label for what the baseline represents, e.g. "₹3,00,000 deployed". */
  baselineLabel?: string;
}

/** Horizontal travel before we treat the gesture as a scrub, in points. */
const CLAIM_THRESHOLD = 6;

export default function EquityChart({
  model, height = 120, detailed = false, baselineLabel,
}: Props) {
  const s = useStyles();
  const t = useTheme();

  const [plotWidth, setPlotWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const touchStart = useRef({ x: 0, y: 0 });

  const { bars } = model;
  const gap = bars.length > 60 ? 1 : bars.length > 24 ? 2 : 3;
  const baseY = model.baselineAt * height;

  const shown: ChartBar = bars[activeIndex ?? bars.length - 1] ?? bars[bars.length - 1];
  const scrubbing = activeIndex !== null;

  const toneOf = (bar: ChartBar) =>
    bar.direction === 'up' ? t.gain : bar.direction === 'down' ? t.loss : t.inkFaint;

  function scrubTo(x: number) {
    if (plotWidth <= 0 || bars.length === 0) return;
    const i = Math.floor((x / plotWidth) * bars.length);
    setActiveIndex(Math.min(bars.length - 1, Math.max(0, i)));
  }

  const onLayout = (e: LayoutChangeEvent) => setPlotWidth(e.nativeEvent.layout.width);

  const scrub = detailed
    ? {
        onStartShouldSetResponder: (e: GestureResponderEvent) => {
          touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          return false;
        },
        onMoveShouldSetResponder: (e: GestureResponderEvent) => {
          const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x);
          const dy = Math.abs(e.nativeEvent.pageY - touchStart.current.y);
          return dx > CLAIM_THRESHOLD && dx > dy;
        },
        // Once scrubbing, keep the gesture even if it drifts vertically —
        // otherwise the scroll view takes over halfway through a drag.
        onResponderTerminationRequest: () => false,
        onResponderGrant: (e: GestureResponderEvent) => scrubTo(e.nativeEvent.locationX),
        onResponderMove: (e: GestureResponderEvent) => scrubTo(e.nativeEvent.locationX),
        onResponderRelease: () => setActiveIndex(null),
        onResponderTerminate: () => setActiveIndex(null),
      }
    : null;

  return (
    <View style={s.wrap}>
      {detailed ? (
      <View style={s.readout}>
        <View style={s.readoutLeft}>
          <Text style={s.readoutDate}>
            {shortDate(shown.date)}
            {scrubbing ? '' : ' · latest'}
          </Text>
          <Text style={s.readoutValue}>{rupees(shown.value)}</Text>
        </View>
        <Text style={[s.readoutDelta, { color: toneOf(shown) }]}>
          {signedRupees(shown.deviation)}
        </Text>
      </View>
      ) : null}

      <View
        style={[s.plot, { height }]}
        onLayout={onLayout}
        accessibilityRole="image"
        accessibilityLabel={
          `Equity chart, ${bars.length} sessions. ` +
          `Latest ${rupees(model.last.value)}, ${signedRupees(model.last.value - model.baseline)} against capital.`
        }
        {...scrub}>

        <View style={[s.baseline, { top: baseY }]} />

        <View style={[s.bars, { gap }]}>
          {bars.map((bar, i) => {
            const active = i === activeIndex;
            const latest = i === bars.length - 1 && activeIndex === null;
            const emphasis = active || latest;
            const tone = toneOf(bar);
            const barHeight = bar.magnitude * height;

            return (
              <View key={`${bar.date}-${i}`} style={s.column}>
                {active ? <View style={[s.guide, { backgroundColor: t.ruleStrong }]} /> : null}

                {bar.magnitude > 0.004 ? (
                  <View
                    style={[
                      s.bar,
                      {
                        height: barHeight,
                        backgroundColor: tone,
                        opacity: emphasis ? 0.9 : 0.34,
                        ...(bar.direction === 'up'
                          ? { bottom: height - baseY }
                          : { top: baseY }),
                      },
                    ]}>
                    <View
                      style={[
                        s.cap,
                        { backgroundColor: tone },
                        bar.direction === 'up' ? { top: 0 } : { bottom: 0 },
                      ]}
                    />
                  </View>
                ) : (
                  // A session that finished exactly at capital still happened.
                  <View
                    style={[
                      s.flat,
                      { top: baseY - 1, backgroundColor: emphasis ? t.inkDim : t.ruleStrong },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>

        {detailed ? (
          <>
            <Text style={[s.bound, { top: 2 }]}>+{compactRupees(model.above)}</Text>
            <Text style={[s.bound, { bottom: 2 }]}>-{compactRupees(model.below)}</Text>
          </>
        ) : null}
      </View>

      {detailed ? (
        <View style={s.rail}>
          <Text style={s.railText}>{shortDate(model.first.date)}</Text>
          {baselineLabel ? <Text style={s.railText}>{baselineLabel}</Text> : null}
          <Text style={s.railText}>{shortDate(model.last.date)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: space.sm },

  readout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  readoutLeft: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  readoutDate: { fontSize: type.caption, color: t.inkFaint, fontWeight: '600' },
  readoutValue: { fontFamily: mono, fontSize: type.caption + 1, color: t.inkDim, ...tabular },
  readoutDelta: { fontFamily: mono, fontSize: type.label, fontWeight: '700', ...tabular },

  plot: {
    justifyContent: 'center',
    backgroundColor: t.sunk,
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: space.sm,
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.ruleStrong,
  },
  bars: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: space.sm,
  },
  column: { flex: 1, minWidth: 1 },
  guide: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: StyleSheet.hairlineWidth },
  bar: { position: 'absolute', left: 0, right: 0, borderRadius: 1 },
  cap: { position: 'absolute', left: 0, right: 0, height: 2 },
  flat: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1 },

  bound: {
    position: 'absolute',
    right: space.sm,
    fontFamily: mono,
    fontSize: type.micro,
    color: t.inkFaint,
    ...tabular,
  },

  rail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  railText: { fontSize: type.micro + 0.5, color: t.inkFaint, fontWeight: '600' },
}));
