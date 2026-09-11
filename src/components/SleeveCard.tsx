/**
 * One sleeve, summarised. The whole card opens the sleeve's detail sheet.
 *
 * The card answers three questions in reading order: what is it worth, what
 * is it doing (the status chip), and how is the money split (the allocation
 * bar). Everything else lives one tap away.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { makeStyles, mono, radius, space, tabular, toneFor, type, useTheme } from '../theme';
import { Sleeve } from '../types';
import {
  rupees, shortDate, signedPct, signedRupees, sleeveState, SleeveStateKind, summarise,
} from '../lib/format';
import { buildChart, curveOf } from '../lib/series';
import EquityChart from './EquityChart';
import { Chip, ChipTone, Tappable } from './ui';

/**
 * Status colours. "Live" is deliberately neutral: green is reserved for
 * gains, and a sleeve that holds positions while down 2% is not good news.
 */
export function useChipTone(kind: SleeveStateKind): ChipTone {
  const t = useTheme();
  switch (kind) {
    case 'live': return { fg: t.ink, bg: t.sunk };
    case 'pending': return { fg: t.accent, bg: t.accentSoft };
    case 'error':
    case 'halted': return { fg: t.loss, bg: t.lossSoft };
    case 'idle':
    default: return { fg: t.idle, bg: t.idleSoft };
  }
}

export default function SleeveCard({ sleeve, onPress }: { sleeve: Sleeve; onPress: () => void }) {
  const s = useStyles();
  const t = useTheme();
  const summary = useMemo(() => summarise(sleeve), [sleeve]);
  const status = sleeveState(sleeve, summary);
  const chipTone = useChipTone(status.kind);
  const chart = useMemo(
    () => buildChart(curveOf(sleeve.state), sleeve.capital),
    [sleeve.state, sleeve.capital],
  );

  const tone = toneFor(t, summary.returnPct);
  const investedShare = summary.equity > 0 ? summary.invested / summary.equity : 0;
  const trades = sleeve.state?.trades?.length ?? 0;

  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        `${sleeve.name}. ${rupees(summary.equity)}, ${signedPct(summary.returnPct)}. ${status.label}.`
      }
      accessibilityHint="Opens holdings, queued orders and trade history"
      style={s.card}>
      <View style={s.head}>
        <View style={s.identity}>
          <Text style={s.name}>{sleeve.name}</Text>
          <Text style={s.rule}>{sleeve.rule}</Text>
        </View>
        <View style={s.figure}>
          <Text style={[s.amount, { color: summary.returnPct === 0 ? t.ink : tone }]}>
            {rupees(summary.equity)}
          </Text>
          <Text style={[s.pct, { color: tone === t.ink ? t.inkDim : tone }]}>
            {signedPct(summary.returnPct)}
            {summary.dayChange !== null && summary.dayChange !== 0
              ? ` · ${signedRupees(summary.dayChange)} today`
              : ''}
          </Text>
        </View>
      </View>

      <View style={s.statusRow}>
        <Chip tone={chipTone} label={status.label} pulse={status.kind === 'pending'} />
        {summary.valuedOn ? (
          <Text style={s.valued}>{shortDate(summary.valuedOn)} close</Text>
        ) : null}
      </View>

      {sleeve.error ? (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{sleeve.error}</Text>
        </View>
      ) : (
        <>
          {chart && chart.bars.length >= 2 ? (
            <EquityChart model={chart} height={56} />
          ) : (
            <View style={s.chartPending}>
              <Text style={s.chartPendingText}>
                {summary.valuedOn
                  ? `First valuation on ${shortDate(summary.valuedOn)}. The chart fills in from the next session.`
                  : 'Waiting for the first valuation.'}
              </Text>
            </View>
          )}

          <View style={s.alloc} accessible accessibilityLabel={
            `${Math.round(investedShare * 100)} percent invested, ${rupees(summary.cash)} cash`
          }>
            <View style={s.allocTrack}>
              <View style={[s.allocFill, { flex: investedShare, backgroundColor: t.accent }]} />
              <View style={{ flex: Math.max(0, 1 - investedShare) }} />
            </View>
            <View style={s.allocLegend}>
              <Text style={s.allocText}>
                <Text style={s.allocFigure}>{rupees(summary.invested)}</Text> invested
              </Text>
              <Text style={s.allocText}>
                <Text style={s.allocFigure}>{rupees(summary.cash)}</Text> cash
              </Text>
            </View>
          </View>
        </>
      )}

      <View style={s.foot}>
        <Text style={s.footText}>
          {summary.positionCount} held · {summary.pendingCount} queued · {trades} trade{trades === 1 ? '' : 's'}
        </Text>
        <Text style={s.chevron}>Details ›</Text>
      </View>
    </Tappable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ruleStrong,
    padding: space.lg,
    gap: space.md + 2,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  identity: { flex: 1, gap: 3 },
  name: { fontSize: type.heading, fontWeight: '700', color: t.ink, letterSpacing: -0.2 },
  rule: { fontSize: type.label - 0.5, color: t.inkDim },
  figure: { alignItems: 'flex-end', gap: 3 },
  amount: { fontFamily: mono, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, ...tabular },
  pct: { fontFamily: mono, fontSize: type.caption, fontWeight: '600', ...tabular },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valued: { fontSize: type.caption, color: t.inkFaint, fontWeight: '600' },

  chartPending: {
    backgroundColor: t.sunk,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  chartPendingText: { fontSize: type.caption + 0.5, lineHeight: 18, color: t.inkDim },

  alloc: { gap: space.sm },
  allocTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: t.idleSoft,
  },
  allocFill: { borderRadius: 3 },
  allocLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  allocText: { fontSize: type.caption, color: t.inkDim },
  allocFigure: { fontFamily: mono, fontWeight: '700', color: t.ink, ...tabular },

  errorBox: { padding: space.md + 2, backgroundColor: t.lossSoft, borderRadius: radius.sm },
  errorText: { color: t.loss, fontSize: type.label + 0.5, lineHeight: 20 },

  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.rule,
  },
  footText: { fontSize: type.caption, color: t.inkDim, ...tabular },
  chevron: { fontSize: type.label, fontWeight: '700', color: t.accent },
}));
