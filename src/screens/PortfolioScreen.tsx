import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { Palette, mono } from '../theme';
import { Sleeve, SLEEVE_CONFIG } from '../types';
import { fetchSleeveState, fetchLastCommit } from '../api/github';
import { clearToken } from '../storage/token';
import { rupees, signedPct, relativeTime, shortDate, summarise } from '../lib/format';
import SleeveCard from '../components/SleeveCard';

interface Props {
  palette: Palette;
  token: string;
  onDisconnect: () => void;
}

export default function PortfolioScreen({ palette, token, onDisconnect }: Props) {
  const s = styles(palette);
  const [sleeves, setSleeves] = useState<Sleeve[] | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const loaded: Sleeve[] = await Promise.all(
      SLEEVE_CONFIG.map(async (cfg) => {
        try {
          const state = await fetchSleeveState(token, cfg.path);
          return { key: cfg.key, name: cfg.name, rule: cfg.rule, capital: cfg.capital, state };
        } catch (e) {
          return {
            key: cfg.key, name: cfg.name, rule: cfg.rule, capital: cfg.capital,
            state: null,
            error: e instanceof Error ? e.message : 'Could not load this sleeve.',
          };
        }
      }),
    );
    setSleeves(loaded);
    setLastRun(await fetchLastCommit(token, SLEEVE_CONFIG[0].path));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function confirmDisconnect() {
    Alert.alert(
      'Disconnect?',
      'The stored token will be removed from this device. Your portfolio and the scheduled job are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect', style: 'destructive',
          onPress: async () => { await clearToken(); onDisconnect(); },
        },
      ],
    );
  }

  if (!sleeves) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={s.loadingText}>Reading portfolio…</Text>
      </View>
    );
  }

  const summaries = sleeves.map((sl) => ({ sleeve: sl, summary: summarise(sl) }));
  const totals = summaries.reduce(
    (acc, { sleeve, summary }) => ({
      equity: acc.equity + (sleeve.error ? sleeve.capital : summary.equity),
      capital: acc.capital + sleeve.capital,
    }),
    { equity: 0, capital: 0 },
  );
  const totalPct = ((totals.equity - totals.capital) / totals.capital) * 100;

  // Both sleeves are valued at the same session close; take the latest we have.
  const valuedOn = summaries
    .map(({ summary }) => summary.valuedOn)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop() ?? null;
  const tone = totalPct > 0 ? palette.gain : totalPct < 0 ? palette.loss : palette.ink;

  return (
    <ScrollView
      style={s.flex}
      contentContainerStyle={s.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.accent}
          colors={[palette.accent]}
        />
      }>
      <View style={s.header}>
        <View style={s.headerTop}>
          <Text style={s.eyebrow}>Paper portfolio · NSE</Text>
          <Pressable
            onPress={confirmDisconnect}
            hitSlop={10}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={s.disconnect}>Disconnect</Text>
          </Pressable>
        </View>
        <View style={s.totalRow}>
          <Text style={[s.total, { color: tone }]}>{rupees(totals.equity)}</Text>
          <Text style={[s.totalPct, { color: tone }]}>{signedPct(totalPct)}</Text>
        </View>
        <Text style={s.deployed}>on {rupees(totals.capital)} deployed</Text>
        <Text style={s.stamp}>
          Valued at {valuedOn ? shortDate(valuedOn) + ' close' : 'last session close'} ·
          cron ran {relativeTime(lastRun)} · pull to refresh
        </Text>
      </View>

      {sleeves.map((sl) => (
        <SleeveCard key={sl.key} palette={palette} sleeve={sl} />
      ))}

      <Text style={s.footer}>
        Paper trading — no broker connection and no real orders. This app reads only; it
        cannot commit, trigger workflows, or affect the scheduled job.
      </Text>
    </ScrollView>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: p.ground },
    scroll: { padding: 16, paddingBottom: 40, gap: 14 },
    loading: {
      flex: 1, backgroundColor: p.ground,
      alignItems: 'center', justifyContent: 'center', gap: 14,
    },
    loadingText: { color: p.inkDim, fontSize: 14 },

    header: { gap: 5, paddingHorizontal: 2, paddingTop: 6, paddingBottom: 8 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    eyebrow: {
      fontSize: 10.5, letterSpacing: 1.1, textTransform: 'uppercase',
      color: p.inkDim, fontWeight: '700',
    },
    disconnect: { fontSize: 12.5, color: p.inkDim, fontWeight: '600' },
    totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
    total: { fontFamily: mono, fontSize: 34, fontWeight: '700', letterSpacing: -1 },
    totalPct: { fontFamily: mono, fontSize: 16, fontWeight: '600' },
    deployed: { fontSize: 13, color: p.inkDim },
    stamp: { fontSize: 11.5, color: p.inkDim, marginTop: 2 },

    footer: {
      fontSize: 11.5, lineHeight: 18, color: p.inkDim,
      paddingHorizontal: 2, paddingTop: 6,
    },
  });
