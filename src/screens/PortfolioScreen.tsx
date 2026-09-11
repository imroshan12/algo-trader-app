/**
 * The portfolio: both sleeves combined, then each on its own.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';

import { makeStyles, mono, radius, space, tabular, toneFor, type, useTheme } from '../theme';
import { Sleeve } from '../types';
import { usePortfolio } from '../hooks/usePortfolio';
import { useCountUp } from '../hooks/useCountUp';
import { clearToken } from '../storage/token';
import {
  daysBetween, isStale, relativeTime, rupees, shortDate, signedPct, signedRupees, summarise,
} from '../lib/format';
import {
  availableRanges, buildChart, combineCurves, downsample, Range, sliceByRange,
} from '../lib/series';
import EquityChart from '../components/EquityChart';
import SleeveCard from '../components/SleeveCard';
import SleeveDetailSheet from './SleeveDetailSheet';
import { SAMPLE_MODE } from '../dev/sample';
import { Appear, GhostButton, Label, PrimaryButton, Segmented, Skeleton } from '../components/ui';

interface Props {
  token: string;
  onDisconnect: () => void;
}

type HeroMode = 'value' | 'pnl' | 'return';
const NEXT_MODE: Record<HeroMode, HeroMode> = { value: 'pnl', pnl: 'return', return: 'value' };

export default function PortfolioScreen({ token, onDisconnect }: Props) {
  const s = useStyles();
  const t = useTheme();
  const data = usePortfolio(token);
  const now = useMinuteClock();

  const [openKey, setOpenKey] = useState<Sleeve['key'] | null>(null);
  const openSleeve = data.sleeves.find((sl) => sl.key === openKey) ?? null;

  const [mode, setMode] = useState<HeroMode>('value');
  const [range, setRange] = useState<Range>('ALL');

  const totals = useMemo(() => {
    let equity = 0;
    let capital = 0;
    for (const sl of data.sleeves) {
      capital += sl.capital;
      // A sleeve we could not read is assumed to be where it started, so
      // one failed file doesn't read as a portfolio-wide crash.
      equity += sl.error ? sl.capital : summarise(sl).equity;
    }
    return { equity, capital };
  }, [data.sleeves]);

  const combined = useMemo(() => combineCurves(data.sleeves), [data.sleeves]);
  const ranges = useMemo(() => availableRanges(combined), [combined]);
  useEffect(() => {
    if (!ranges.includes(range)) setRange('ALL');
  }, [ranges, range]);
  const chart = useMemo(
    () => buildChart(downsample(sliceByRange(combined, range), 90), totals.capital),
    [combined, range, totals.capital],
  );

  const valuedOn = combined.length ? combined[combined.length - 1].date : null;
  const dayChange =
    combined.length >= 2
      ? combined[combined.length - 1].value - combined[combined.length - 2].value
      : null;

  const animated = useCountUp(totals.equity);
  const pnl = animated - totals.capital;
  const pct = totals.capital > 0 ? (pnl / totals.capital) * 100 : 0;
  const tone = toneFor(t, Math.round(totals.equity - totals.capital));

  const disconnect = useCallback(async () => {
    await clearToken();
    onDisconnect();
  }, [onDisconnect]);

  const confirmDisconnect = useCallback(() => {
    Alert.alert(
      'Disconnect this device?',
      'The token is removed from this phone. Your portfolio and the scheduled job are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
      ],
    );
  }, [disconnect]);

  const openMenu = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Refresh now', 'Disconnect', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (i) => {
          if (i === 0) data.refresh();
          if (i === 1) confirmDisconnect();
        },
      );
    } else {
      Alert.alert('Portfolio', undefined, [
        { text: 'Refresh now', onPress: data.refresh },
        { text: 'Disconnect', style: 'destructive', onPress: confirmDisconnect },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [data.refresh, confirmDisconnect]);

  // ── Nothing to show yet ──

  if (data.phase === 'loading') return <LoadingSkeleton />;

  if (data.phase === 'failed') {
    return (
      <View style={s.failed}>
        <Text style={s.failedTitle}>Couldn't load your portfolio</Text>
        <Text style={s.failedBody}>{data.error}</Text>
        <View style={s.failedActions}>
          <PrimaryButton title="Try again" onPress={data.refresh} busy={data.refreshing} />
          {data.authFailed ? (
            <GhostButton title="Connect with a different token" onPress={disconnect} tone={t.accent} />
          ) : null}
        </View>
      </View>
    );
  }

  // ── Portfolio ──

  const heroMain =
    mode === 'value' ? rupees(animated)
    : mode === 'pnl' ? signedRupees(pnl)
    : signedPct(pct);
  const heroSub =
    mode === 'value' ? `${signedRupees(pnl)} (${signedPct(pct)})`
    : mode === 'pnl' ? `on ${rupees(totals.capital)} deployed`
    : `${rupees(animated)} total value`;
  const stale = isStale(valuedOn, now);
  const staleDays = valuedOn ? daysBetween(valuedOn, now) : null;

  return (
    <>
      <ScrollView
        style={s.flex}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={data.refresh}
            tintColor={t.inkDim}
            colors={[t.accent]}
            progressBackgroundColor={t.surface}
          />
        }>
        <View style={s.topBar}>
          <Label>{SAMPLE_MODE ? 'Sample data · not your portfolio' : 'Paper portfolio · NSE'}</Label>
          <Pressable
            onPress={openMenu}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Portfolio options"
            style={({ pressed }) => [s.menu, pressed && { opacity: 0.5 }]}>
            <Text style={s.menuGlyph}>•••</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setMode(NEXT_MODE[mode])}
          accessibilityRole="button"
          accessibilityLabel={`${heroMain}. ${heroSub}`}
          accessibilityHint="Switches between total value, profit and return"
          style={s.hero}>
          <Text
            style={[s.heroMain, { color: mode === 'value' && Math.round(pnl) === 0 ? t.ink : tone }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {heroMain}
          </Text>
          <View style={s.heroSubRow}>
            {/* Only the value view's subtitle is itself a gain or loss; the
                others are context and stay neutral. */}
            <Text style={[s.heroSub, { color: mode === 'value' && Math.round(pnl) !== 0 ? tone : t.inkDim }]}>
              {heroSub}
            </Text>
            {dayChange !== null && Math.round(dayChange) !== 0 ? (
              <View style={[s.dayPill, { backgroundColor: dayChange > 0 ? t.gainSoft : t.lossSoft }]}>
                <Text style={[s.dayPillText, { color: toneFor(t, dayChange) }]}>
                  {signedRupees(dayChange)} today
                </Text>
              </View>
            ) : null}
          </View>
          <View style={s.modeDots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {(['value', 'pnl', 'return'] as const).map((m) => (
              <View key={m} style={[s.modeDot, m === mode && { backgroundColor: t.inkDim, width: 14 }]} />
            ))}
          </View>
        </Pressable>

        <Text style={s.stamp}>
          {valuedOn ? `Valued at ${shortDate(valuedOn)} close` : 'Not yet valued'}
          {data.lastRun ? ` · job ran ${relativeTime(data.lastRun)}` : ''}
        </Text>

        {stale ? (
          <View style={[s.banner, { backgroundColor: t.idleSoft }]}>
            <Text style={[s.bannerText, { color: t.idle }]}>
              Last valued {staleDays} days ago. The scheduled job may have stopped — check the
              Actions tab of the algo-trader repository.
            </Text>
          </View>
        ) : null}

        {data.error ? (
          <View style={[s.banner, s.bannerRow, { backgroundColor: t.lossSoft }]}>
            <Text style={[s.bannerText, { color: t.loss, flex: 1 }]}>
              Couldn't refresh. Showing figures from {relativeTime(
                data.fetchedAt ? new Date(data.fetchedAt).toISOString() : null,
              )}.
            </Text>
            <GhostButton title="Retry" onPress={data.refresh} tone={t.loss} />
          </View>
        ) : null}

        {chart && chart.bars.length >= 2 ? (
          <Appear style={s.chartBlock}>
            {ranges.length > 1 ? (
              <Segmented options={ranges} value={range} onChange={setRange} accessibilityLabel="Chart range" />
            ) : null}
            <EquityChart
              model={chart}
              height={132}
              detailed
              baselineLabel={`${rupees(totals.capital)} deployed`}
            />
          </Appear>
        ) : null}

        <View style={s.sleeves}>
          <Label>Sleeves</Label>
          {data.sleeves.map((sl, i) => (
            <Appear key={sl.key} index={i + 1}>
              <SleeveCard sleeve={sl} onPress={() => setOpenKey(sl.key)} />
            </Appear>
          ))}
        </View>

        <Text style={s.footer}>
          Paper trading — no broker connection and no real orders. This app only reads; it
          cannot commit, trigger workflows, or affect the scheduled job.
        </Text>
      </ScrollView>

      <SleeveDetailSheet sleeve={openSleeve} onClose={() => setOpenKey(null)} />
    </>
  );
}

// ── Loading ──

/**
 * Shaped like the screen it stands in for, so nothing jumps when the real
 * content lands. A centred spinner tells you only that something is
 * happening; a skeleton tells you what is about to appear.
 */
function LoadingSkeleton() {
  const s = useStyles();
  return (
    <View style={[s.flex, s.scroll]} accessibilityLabel="Loading portfolio" accessible>
      <Skeleton width={150} height={10} />
      <View style={{ gap: space.sm }}>
        <Skeleton width="62%" height={38} />
        <Skeleton width="40%" height={14} />
      </View>
      <Skeleton width="100%" height={160} radius={radius.sm} />
      <Skeleton width="100%" height={230} radius={radius.lg} />
      <Skeleton width="100%" height={230} radius={radius.lg} />
    </View>
  );
}

/** Re-render once a minute so "3 min ago" keeps telling the truth. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, backgroundColor: t.ground },
  scroll: { padding: space.lg, paddingBottom: space.xxl + space.lg, gap: space.lg },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.xs },
  menu: { paddingHorizontal: space.xs, paddingVertical: 2 },
  menuGlyph: { fontSize: type.label, color: t.inkDim, letterSpacing: 1, fontWeight: '800' },

  hero: { gap: space.sm },
  heroMain: { fontFamily: mono, fontSize: type.hero, fontWeight: '700', letterSpacing: -1.2, ...tabular },
  heroSubRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  heroSub: { fontFamily: mono, fontSize: type.label + 0.5, fontWeight: '600', ...tabular },
  dayPill: { borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 3 },
  dayPillText: { fontFamily: mono, fontSize: type.caption, fontWeight: '700', ...tabular },
  modeDots: { flexDirection: 'row', gap: 5, paddingTop: 2 },
  modeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: t.ruleStrong },

  stamp: { fontSize: type.caption, color: t.inkFaint, marginTop: -space.xs },

  banner: { borderRadius: radius.sm, paddingHorizontal: space.md + 2, paddingVertical: space.md },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bannerText: { fontSize: type.label, lineHeight: 19, fontWeight: '500' },

  chartBlock: {
    gap: space.md,
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ruleStrong,
    padding: space.lg,
  },

  sleeves: { gap: space.md, paddingTop: space.xs },

  footer: { fontSize: type.caption, lineHeight: 18, color: t.inkFaint, paddingTop: space.sm },

  failed: {
    flex: 1,
    backgroundColor: t.ground,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  failedTitle: { fontSize: type.title, fontWeight: '700', color: t.ink, letterSpacing: -0.4 },
  failedBody: { fontSize: type.body, lineHeight: 23, color: t.inkDim },
  failedActions: { gap: space.lg, marginTop: space.md, alignItems: 'stretch' },
}));
