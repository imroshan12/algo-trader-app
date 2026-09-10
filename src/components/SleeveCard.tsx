import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette, mono } from '../theme';
import { Sleeve } from '../types';
import { rupees, signedPct, signedRupees, sleeveState, summarise, shortDate } from '../lib/format';

interface Props {
  palette: Palette;
  sleeve: Sleeve;
}

export default function SleeveCard({ palette, sleeve }: Props) {
  const s = styles(palette);
  const summary = summarise(sleeve);
  const state = sleeveState(sleeve, summary);

  const tone =
    summary.returnPct > 0 ? palette.gain
    : summary.returnPct < 0 ? palette.loss
    : palette.ink;

  const chipStyle =
    state.kind === 'live' ? { bg: palette.gainFill, fg: palette.gain }
    : state.kind === 'pending' ? { bg: palette.accentSoft, fg: palette.accent }
    : state.kind === 'error' ? { bg: palette.lossFill, fg: palette.loss }
    : { bg: palette.idleSoft, fg: palette.idle };

  const positions = sleeve.state ? Object.values(sleeve.state.positions ?? {}) : [];
  const pending = sleeve.state?.pending_buys ?? [];

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.identity}>
          <Text style={s.name}>{sleeve.name}</Text>
          <Text style={s.rule}>{sleeve.rule}</Text>
          <View style={[s.chip, { backgroundColor: chipStyle.bg }]}>
            <View style={[s.dot, { backgroundColor: chipStyle.fg }]} />
            <Text style={[s.chipText, { color: chipStyle.fg }]}>{state.label}</Text>
          </View>
        </View>
        <View style={s.figure}>
          <Text style={[s.amount, { color: tone }]}>{rupees(summary.equity)}</Text>
          <Text style={[s.pct, { color: tone }]}>{signedPct(summary.returnPct)}</Text>
        </View>
      </View>

      {sleeve.error ? (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{sleeve.error}</Text>
        </View>
      ) : (
        <>
          <View style={s.strip}>
            <Stat palette={palette} label="Cash" value={rupees(summary.cash)} />
            <Stat palette={palette} label="Invested" value={rupees(summary.invested)} />
            <Stat palette={palette} label="Exits" value={String(summary.exitCount)} />
            <Stat
              palette={palette}
              label="Realised"
              value={signedRupees(summary.realisedPnl)}
              tone={summary.realisedPnl > 0 ? palette.gain
                : summary.realisedPnl < 0 ? palette.loss : undefined}
            />
            <Stat palette={palette} label="Costs" value={rupees(summary.costs)} />
            <Stat
              palette={palette}
              label="Running"
              value={summary.daysRunning ? `day ${summary.daysRunning}` : '—'}
            />
          </View>

          {positions.length > 0 && (
            <View style={s.section}>
              {/* The state file records what we paid, not what each name is
                  worth now — only the portfolio total is marked to market.
                  Label the column honestly rather than implying live prices. */}
              <Text style={s.sectionLabel}>Holdings · at cost</Text>
              {positions
                .slice()
                .sort((a, b) => b.quantity * b.entry_price - a.quantity * a.entry_price)
                .map((p) => (
                  <View key={p.ticker} style={s.row}>
                    <View style={s.rowMain}>
                      <Text style={s.ticker}>{p.ticker.replace('.NS', '')}</Text>
                      <Text style={s.rowSub}>
                        {p.quantity} @ {rupees(p.entry_price)} · since {shortDate(p.entry_date)}
                      </Text>
                    </View>
                    <Text style={s.rowValue}>{rupees(p.quantity * p.entry_price)}</Text>
                  </View>
                ))}
            </View>
          )}

          {pending.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>
                Queued · fills at next session open
              </Text>
              <View style={s.pills}>
                {pending.map((q) => (
                  <View key={q.ticker} style={s.pill}>
                    <Text style={s.pillName}>{q.ticker.replace('.NS', '')}</Text>
                    <Text style={s.pillPrice}>{rupees(q.reference_price, 2)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {positions.length === 0 && pending.length === 0 && (
            <View style={s.section}>
              <Text style={s.quiet}>
                {sleeve.key === 'momentum'
                  ? 'The index is below its 200-day average, so this sleeve is in cash by design. It re-enters at the first monthly rebalance after the market recovers.'
                  : 'No stock currently passes its own trend test. Capital sits in cash until one does.'}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Stat({
  palette, label, value, tone,
}: { palette: Palette; label: string; value: string; tone?: string }) {
  const s = styles(palette);
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: p.surface, borderRadius: 10,
      borderWidth: 1, borderColor: p.rule, overflow: 'hidden',
    },
    head: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: 14, padding: 16,
    },
    identity: { flex: 1, gap: 4 },
    name: { fontSize: 17, fontWeight: '700', color: p.ink, letterSpacing: -0.2 },
    rule: { fontSize: 12.5, color: p.inkDim },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 4, marginTop: 4,
    },
    dot: { width: 6, height: 6, borderRadius: 3 },
    chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
    figure: { alignItems: 'flex-end', gap: 2 },
    amount: { fontFamily: mono, fontSize: 21, fontWeight: '700', letterSpacing: -0.3 },
    pct: { fontFamily: mono, fontSize: 13, fontWeight: '600' },

    strip: {
      flexDirection: 'row', flexWrap: 'wrap',
      backgroundColor: p.sunk, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.rule,
    },
    stat: {
      flexGrow: 1, flexBasis: '33.333%', paddingVertical: 10, paddingHorizontal: 12, gap: 2,
    },
    statLabel: {
      fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase',
      color: p.inkDim, fontWeight: '700',
    },
    statValue: { fontFamily: mono, fontSize: 13.5, fontWeight: '700', color: p.ink },

    section: { padding: 16, gap: 10 },
    sectionLabel: {
      fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase',
      color: p.inkDim, fontWeight: '700',
    },
    row: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.rule,
    },
    rowMain: { flex: 1, gap: 2 },
    ticker: { fontSize: 14.5, fontWeight: '700', color: p.ink },
    rowSub: { fontFamily: mono, fontSize: 11.5, color: p.inkDim },
    rowValue: { fontFamily: mono, fontSize: 14, fontWeight: '600', color: p.ink },

    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      flexDirection: 'row', alignItems: 'baseline', gap: 7,
      backgroundColor: p.sunk, borderRadius: 5,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    pillName: { fontSize: 12.5, fontWeight: '700', color: p.ink },
    pillPrice: { fontFamily: mono, fontSize: 11.5, color: p.inkDim },

    quiet: { fontSize: 13.5, lineHeight: 21, color: p.inkDim },
    errorBox: {
      margin: 16, marginTop: 0, padding: 14,
      backgroundColor: p.lossFill, borderRadius: 6,
    },
    errorText: { color: p.loss, fontSize: 13.5, lineHeight: 20 },
  });
