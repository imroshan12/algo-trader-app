/**
 * List rows for the three things a sleeve contains: what it holds, what it
 * has queued, and what it has done.
 */

import React, { useState } from 'react';
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native';

import { makeStyles, mono, radius, space, tabular, toneFor, type, useTheme } from '../theme';
import { Holding, PendingBuy, Trade } from '../types';
import {
  rupees, shortDate, signedPct, signedRupees, symbolOf, trendStrength,
} from '../lib/format';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Tappable } from './ui';

// ── Holding ──

export function HoldingRow({ holding, last }: { holding: Holding; last?: boolean }) {
  const s = useStyles();
  const t = useTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  const { position: p } = holding;
  const pnlTone = holding.pnl === null ? t.inkDim : toneFor(t, holding.pnl);
  const stop = p.trailing_stop && p.trailing_stop > 0 ? p.trailing_stop : p.stop_loss;

  function toggle() {
    if (!reduced) {
      LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    }
    setOpen((o) => !o);
  }

  return (
    <Tappable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={
        `${holding.symbol}, ${p.quantity} shares, worth ${rupees(holding.value)}` +
        (holding.pnl !== null ? `, ${signedRupees(holding.pnl)}` : ', not yet marked')
      }
      accessibilityHint={open ? 'Collapses details' : 'Shows cost, stop and sector'}
      style={[s.row, !last && s.divider]}>
      <View style={s.line}>
        <View style={s.main}>
          <Text style={s.symbol}>{holding.symbol}</Text>
          <Text style={s.sub}>
            {p.quantity} × {rupees(holding.marked ? p.last_price! : p.entry_price, 2)}
          </Text>
        </View>
        <View style={s.figures}>
          <Text style={s.value}>{rupees(holding.value)}</Text>
          {holding.pnlPct !== null ? (
            <Text style={[s.delta, { color: pnlTone }]}>{signedPct(holding.pnlPct)}</Text>
          ) : (
            <Text style={[s.delta, { color: t.inkFaint }]}>at cost</Text>
          )}
        </View>
      </View>

      {open ? (
        <View style={s.detail}>
          <Cell label="Avg cost" value={rupees(p.entry_price, 2)} />
          <Cell
            label={holding.markDate ? `Close · ${shortDate(holding.markDate)}` : 'Close'}
            value={holding.marked ? rupees(p.last_price!, 2) : 'Next session'}
          />
          <Cell
            label="P&L"
            value={holding.pnl === null ? '—' : signedRupees(holding.pnl)}
            tone={holding.pnl === null ? undefined : pnlTone}
          />
          <Cell label="Invested" value={rupees(holding.cost)} />
          <Cell label="Held" value={holding.daysHeld ? `${holding.daysHeld} d` : '—'} />
          <Cell label="Since" value={shortDate(p.entry_date)} />
          <Cell label="Stop" value={stop && stop > 0 ? rupees(stop, 2) : 'None'} />
          <Cell
            label="To stop"
            value={holding.stopDistancePct === null ? '—' : `${holding.stopDistancePct.toFixed(1)}%`}
          />
          <Cell label="Sector" value={p.sector || '—'} words />
        </View>
      ) : null}
    </Tappable>
  );
}

/**
 * `words` is for a value that is a name rather than a figure (a sector).
 * Figures are set mono so they align; words set mono are just wide, and a
 * sector like "Capital Goods" would truncate in a third of the row.
 */
function Cell({
  label, value, tone, words = false,
}: { label: string; value: string; tone?: string; words?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.cell}>
      <Text style={s.cellLabel} numberOfLines={1}>{label}</Text>
      <Text
        style={[words ? s.cellWords : s.cellValue, tone ? { color: tone } : null]}
        numberOfLines={words ? 2 : 1}>
        {value}
      </Text>
    </View>
  );
}

// ── Queued order ──

/**
 * `maxStrength` is the strongest trend in the list, so every meter shares
 * one scale. Scaling each bar to its own maximum would make them all full.
 */
export function OrderRow({
  order, maxStrength, last,
}: { order: PendingBuy; maxStrength: number; last?: boolean }) {
  const s = useStyles();
  const t = useTheme();
  const strength = trendStrength(order.reason);
  const notional = order.quantity * order.reference_price;
  const fill = strength !== null && maxStrength > 0 ? Math.max(0.04, strength / maxStrength) : 0;

  return (
    <View
      style={[s.row, !last && s.divider]}
      accessible
      accessibilityLabel={
        `Buy ${order.quantity} ${symbolOf(order.ticker)} near ${rupees(order.reference_price, 2)}. ${order.reason}`
      }>
      <View style={s.line}>
        <View style={s.main}>
          <Text style={s.symbol}>{symbolOf(order.ticker)}</Text>
          <Text style={s.sub}>
            Buy {order.quantity} · ref {rupees(order.reference_price, 2)}
          </Text>
        </View>
        <View style={s.figures}>
          <Text style={s.value}>{rupees(notional)}</Text>
          {strength !== null ? (
            <Text style={[s.delta, { color: t.accent }]}>{signedPct(strength, 0)} vs 200-DMA</Text>
          ) : (
            <Text style={[s.delta, { color: t.inkDim }]} numberOfLines={1}>{order.reason}</Text>
          )}
        </View>
      </View>
      {strength !== null ? (
        <View style={s.meterTrack}>
          <View style={[s.meterFill, { width: `${fill * 100}%`, backgroundColor: t.accent }]} />
        </View>
      ) : null}
    </View>
  );
}

// ── Trade ──

export function TradeRow({ trade, last }: { trade: Trade; last?: boolean }) {
  const s = useStyles();
  const t = useTheme();
  const isBuy = trade.action === 'BUY';
  const pnl = trade.pnl_net;
  const badge = isBuy
    ? { fg: t.accent, bg: t.accentSoft, text: 'BUY' }
    : { fg: t.inkDim, bg: t.sunk, text: trade.action === 'PARTIAL_SELL' ? 'TRIM' : 'SELL' };

  return (
    <View
      style={[s.row, !last && s.divider]}
      accessible
      accessibilityLabel={
        `${shortDate(trade.date)}: ${badge.text} ${trade.quantity} ${symbolOf(trade.ticker)} at ${rupees(trade.price, 2)}` +
        (!isBuy && typeof pnl === 'number' ? `, net ${signedRupees(pnl)}` : '')
      }>
      <View style={s.line}>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.fg }]}>{badge.text}</Text>
        </View>
        <View style={s.main}>
          <Text style={s.symbol}>{symbolOf(trade.ticker)}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {shortDate(trade.date)} · {trade.quantity} @ {rupees(trade.price, 2)}
          </Text>
        </View>
        <View style={s.figures}>
          {!isBuy && typeof pnl === 'number' ? (
            <Text style={[s.value, { color: toneFor(t, pnl) }]}>{signedRupees(pnl)}</Text>
          ) : (
            <Text style={s.value}>{rupees(trade.notional)}</Text>
          )}
          <Text style={[s.delta, { color: t.inkFaint }]}>costs {rupees(trade.costs)}</Text>
        </View>
      </View>
      {trade.reason ? <Text style={s.reason} numberOfLines={2}>{trade.reason}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.rule },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  main: { flex: 1, gap: 2 },
  symbol: { fontSize: type.body, fontWeight: '700', color: t.ink, letterSpacing: 0.2 },
  sub: { fontFamily: mono, fontSize: type.caption, color: t.inkDim, ...tabular },
  figures: { alignItems: 'flex-end', gap: 2, maxWidth: '55%' },
  value: { fontFamily: mono, fontSize: type.label + 1, fontWeight: '700', color: t.ink, ...tabular },
  delta: { fontFamily: mono, fontSize: type.caption, fontWeight: '600', ...tabular },

  detail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: t.sunk,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
  },
  cell: { flexBasis: '33.333%', flexGrow: 1, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 },
  cellLabel: {
    fontSize: type.micro,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: t.inkFaint,
    fontWeight: '700',
  },
  cellValue: { fontFamily: mono, fontSize: type.caption + 0.5, fontWeight: '700', color: t.ink, ...tabular },
  cellWords: { fontSize: type.label - 0.5, fontWeight: '600', color: t.ink, lineHeight: 17 },

  meterTrack: { height: 3, borderRadius: 2, backgroundColor: t.sunk, overflow: 'hidden' },
  meterFill: { height: 3, borderRadius: 2, opacity: 0.75 },

  badge: { borderRadius: radius.sm - 2, paddingHorizontal: space.sm - 2, paddingVertical: 3, minWidth: 42, alignItems: 'center' },
  badgeText: { fontSize: type.micro, fontWeight: '800', letterSpacing: 0.6 },
  reason: { fontSize: type.caption, color: t.inkDim, lineHeight: 17 },
}));
