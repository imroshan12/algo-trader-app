/**
 * Everything about one sleeve, in a native sheet.
 *
 * On iOS this is a page sheet: it slides up over the portfolio, which stays
 * visible behind it, and a downward swipe dismisses it. That keeps the user
 * oriented — they are looking *into* a sleeve, not navigating away from the
 * portfolio — and it needs no navigation library.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, mono, radius, space, tabular, toneFor, type, useTheme } from '../theme';
import { Sleeve } from '../types';
import {
  holdingsOf, HoldingSort, queuedNotional, rupees, signedPct, signedRupees,
  sleeveState, sortHoldings, summarise, trendStrength,
} from '../lib/format';
import { availableRanges, buildChart, curveOf, downsample, Range, sliceByRange } from '../lib/series';
import EquityChart from '../components/EquityChart';
import { HoldingRow, OrderRow, TradeRow } from '../components/rows';
import { useChipTone } from '../components/SleeveCard';
import { Chip, GhostButton, Label, Segmented, Stat } from '../components/ui';

type Tab = 'Holdings' | 'Orders' | 'Trades';
const TABS: readonly Tab[] = ['Holdings', 'Orders', 'Trades'];
const SORTS: readonly HoldingSort[] = ['value', 'pnl', 'name'];
const SORT_LABEL: Record<HoldingSort, string> = { value: 'Value', pnl: 'P&L', name: 'A–Z' };

interface Props {
  sleeve: Sleeve | null;
  onClose: () => void;
}

export default function SleeveDetailSheet({ sleeve, onClose }: Props) {
  return (
    <Modal
      visible={sleeve !== null}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      statusBarTranslucent>
      {sleeve ? <Body sleeve={sleeve} onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ sleeve, onClose }: { sleeve: Sleeve; onClose: () => void }) {
  const s = useStyles();
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const summary = useMemo(() => summarise(sleeve), [sleeve]);
  const status = sleeveState(sleeve, summary);
  const chipTone = useChipTone(status.kind);

  const curve = useMemo(() => curveOf(sleeve.state), [sleeve.state]);
  const ranges = useMemo(() => availableRanges(curve), [curve]);
  const [range, setRange] = useState<Range>('ALL');
  useEffect(() => {
    if (!ranges.includes(range)) setRange('ALL');
  }, [ranges, range]);
  const chart = useMemo(
    () => buildChart(downsample(sliceByRange(curve, range), 90), sleeve.capital),
    [curve, range, sleeve.capital],
  );

  const holdings = useMemo(() => holdingsOf(sleeve), [sleeve]);
  const pending = sleeve.state?.pending_buys ?? [];
  const trades = useMemo(() => (sleeve.state?.trades ?? []).slice().reverse(), [sleeve.state]);

  // Open on whichever tab has something in it — landing on an empty
  // Holdings list when fourteen orders are queued is a wasted tap.
  const [tab, setTab] = useState<Tab>(
    holdings.length > 0 ? 'Holdings' : pending.length > 0 ? 'Orders' : trades.length > 0 ? 'Trades' : 'Holdings',
  );
  const [sort, setSort] = useState<HoldingSort>('value');
  const sorted = useMemo(() => sortHoldings(holdings, sort), [holdings, sort]);

  const committed = queuedNotional(pending);
  // The cron sizes each queued order against the whole cash balance, not
  // what earlier orders leave behind, so the queue can exceed cash. At the
  // open it fills in list order and skips any order that no longer fits.
  const overCommitted = committed > summary.cash;
  const maxStrength = pending.reduce((m, q) => Math.max(m, trendStrength(q.reason) ?? 0), 0);
  const anyUnmarked = holdings.some((h) => !h.marked);
  const tone = toneFor(t, summary.pnl);

  const countOf = (tb: Tab) =>
    tb === 'Holdings' ? holdings.length : tb === 'Orders' ? pending.length : trades.length;

  return (
    <View style={[s.root, Platform.OS === 'android' && { paddingTop: insets.top }]}>
      <View style={s.bar}>
        {Platform.OS === 'ios' ? <View style={s.grabber} /> : null}
        <View style={s.barRow}>
          <View style={s.barTitle}>
            <Text style={s.title}>{sleeve.name}</Text>
            <Text style={s.subtitle}>{sleeve.rule}</Text>
          </View>
          <GhostButton title="Done" onPress={onClose} tone={t.accent} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + space.xxl }]}
        showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Chip tone={chipTone} label={status.label} pulse={status.kind === 'pending'} />
          <Text style={[s.heroValue, { color: summary.pnl === 0 ? t.ink : tone }]}>
            {rupees(summary.equity)}
          </Text>
          <Text style={[s.heroSub, { color: summary.pnl === 0 ? t.inkDim : tone }]}>
            {signedRupees(summary.pnl)} ({signedPct(summary.returnPct)}) on {rupees(sleeve.capital)}
          </Text>
        </View>

        {sleeve.error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{sleeve.error}</Text>
          </View>
        ) : null}

        {chart && chart.bars.length >= 2 ? (
          <View style={s.section}>
            {ranges.length > 1 ? (
              <Segmented options={ranges} value={range} onChange={setRange} accessibilityLabel="Chart range" />
            ) : null}
            <EquityChart
              model={chart}
              height={168}
              detailed
              baselineLabel={`${rupees(sleeve.capital)} capital`}
            />
          </View>
        ) : null}

        <View style={s.stats}>
          <Stat label="Cash" value={rupees(summary.cash)} />
          <Stat label="Invested" value={rupees(summary.invested)} />
          <Stat
            label="Today"
            value={summary.dayChange === null ? '—' : signedRupees(summary.dayChange)}
            tone={summary.dayChange ? toneFor(t, summary.dayChange) : undefined}
          />
          <Stat
            label="Realised"
            value={signedRupees(summary.realisedPnl)}
            tone={summary.realisedPnl ? toneFor(t, summary.realisedPnl) : undefined}
          />
          <Stat label="Costs paid" value={rupees(summary.costs)} />
          <Stat label="Running" value={summary.daysRunning ? `day ${summary.daysRunning}` : '—'} />
        </View>

        <View style={s.section}>
          <Segmented
            options={TABS}
            value={tab}
            onChange={setTab}
            format={(tb) => `${tb} ${countOf(tb)}`}
            accessibilityLabel="Sleeve contents"
          />

          {tab === 'Holdings' ? (
            holdings.length === 0 ? (
              <Empty text={
                pending.length > 0
                  ? `Nothing held yet. ${pending.length} order${pending.length === 1 ? '' : 's'} fill at the next session open.`
                  : sleeve.idleExplanation
              } />
            ) : (
              <>
                <View style={s.listHead}>
                  <Label>Sort</Label>
                  <View style={s.sortRow}>
                    {SORTS.map((key) => (
                      <GhostButton
                        key={key}
                        title={SORT_LABEL[key]}
                        onPress={() => setSort(key)}
                        tone={sort === key ? t.accent : t.inkFaint}
                      />
                    ))}
                  </View>
                </View>
                <View style={s.list}>
                  {sorted.map((h, i) => (
                    <HoldingRow key={h.position.ticker} holding={h} last={i === sorted.length - 1} />
                  ))}
                </View>
                {anyUnmarked ? (
                  <Text style={s.note}>
                    Holdings marked "at cost" have no closing price recorded yet. They are
                    marked from the next scheduled run.
                  </Text>
                ) : null}
                <Text style={s.note}>Tap a holding for its cost, stop and sector.</Text>
              </>
            )
          ) : null}

          {tab === 'Orders' ? (
            pending.length === 0 ? (
              <Empty text="No orders queued. The next evaluation runs after today's close." />
            ) : (
              <>
                <View style={s.committed}>
                  <View style={s.committedRow}>
                    <Label>Committed at next open</Label>
                    <Text style={s.committedFigure}>
                      {rupees(committed)} <Text style={s.committedOf}>of {rupees(summary.cash)}</Text>
                    </Text>
                  </View>
                  <View style={s.committedTrack}>
                    <View
                      style={[
                        s.committedFill,
                        {
                          width: `${Math.min(100, (committed / Math.max(summary.cash, 1)) * 100)}%`,
                          backgroundColor: overCommitted ? t.idle : t.accent,
                        },
                      ]}
                    />
                  </View>
                  {overCommitted ? (
                    <Text style={[s.note, { color: t.idle }]}>
                      More than the cash available. Orders fill in the order listed, and any
                      that no longer fit when their turn comes are skipped.
                    </Text>
                  ) : null}
                </View>
                <View style={s.list}>
                  {pending.map((q, i) => (
                    <OrderRow key={q.ticker} order={q} maxStrength={maxStrength} last={i === pending.length - 1} />
                  ))}
                </View>
                <Text style={s.note}>
                  Orders fill at the next session's open, not at the reference price shown.
                  The final quantity is recomputed against the actual fill.
                </Text>
              </>
            )
          ) : null}

          {tab === 'Trades' ? (
            trades.length === 0 ? (
              <Empty text="No trades yet. Fills appear here after the session they execute in." />
            ) : (
              <View style={s.list}>
                {trades.map((tr, i) => (
                  <TradeRow key={`${tr.date}-${tr.ticker}-${tr.action}-${i}`} trade={tr} last={i === trades.length - 1} />
                ))}
              </View>
            )
          ) : null}
        </View>

        <View style={s.thesis}>
          <Label>How this sleeve works</Label>
          <Text style={s.thesisText}>{sleeve.thesis}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const s = useStyles();
  return (
    <View style={s.empty}>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.ground },

  bar: {
    backgroundColor: t.ground,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.rule,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.ruleStrong,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, gap: space.md },
  barTitle: { flex: 1, gap: 2 },
  title: { fontSize: type.heading + 1, fontWeight: '700', color: t.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: type.caption, color: t.inkDim },

  scroll: { padding: space.lg, gap: space.xl },

  hero: { gap: space.sm, paddingTop: space.xs },
  heroValue: { fontFamily: mono, fontSize: 34, fontWeight: '700', letterSpacing: -1, ...tabular },
  heroSub: { fontFamily: mono, fontSize: type.label, fontWeight: '600', ...tabular },

  section: { gap: space.md },

  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: t.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.rule,
    paddingVertical: space.xs,
  },

  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortRow: { flexDirection: 'row', gap: space.lg },
  list: {
    backgroundColor: t.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.rule,
    overflow: 'hidden',
  },
  note: { fontSize: type.caption, lineHeight: 17, color: t.inkFaint },

  committed: { gap: space.sm },
  committedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  committedFigure: { fontFamily: mono, fontSize: type.label, fontWeight: '700', color: t.ink, ...tabular },
  committedOf: { fontWeight: '400', color: t.inkDim },
  committedTrack: { height: 6, borderRadius: 3, backgroundColor: t.idleSoft, overflow: 'hidden' },
  committedFill: { height: 6, borderRadius: 3, backgroundColor: t.accent },

  empty: {
    backgroundColor: t.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.rule,
    padding: space.lg,
  },
  emptyText: { fontSize: type.label + 0.5, lineHeight: 21, color: t.inkDim },

  thesis: { gap: space.sm, paddingTop: space.xs },
  thesisText: { fontSize: type.label + 1, lineHeight: 22, color: t.inkDim },

  errorBox: { padding: space.md + 2, backgroundColor: t.lossSoft, borderRadius: radius.sm },
  errorText: { color: t.loss, fontSize: type.label + 0.5, lineHeight: 20 },
}));
