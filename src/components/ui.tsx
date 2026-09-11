/**
 * Shared primitives.
 *
 * Everything touchable in this app gives immediate feedback, everything that
 * loads has a shape before it has content, and every control that can be
 * focused by a screen reader announces what it is. Those three things are
 * most of what separates an app that feels finished from one that doesn't.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, PressableProps, StyleSheet, Text, View, ViewStyle,
} from 'react-native';

import { makeStyles, mono, radius, space, tabular, type, useTheme } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ── Text roles ──

export function Label({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const s = useUi();
  return <Text style={[s.label, style as never]}>{children}</Text>;
}

// ── Chip ──

export interface ChipTone {
  fg: string;
  bg: string;
}

export function Chip({ tone, label, pulse = false }: { tone: ChipTone; label: string; pulse?: boolean }) {
  const s = useUi();
  const glow = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!pulse || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.25, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, pulse, reduced]);

  return (
    <View style={[s.chip, { backgroundColor: tone.bg }]}>
      <Animated.View
        style={[s.chipDot, { backgroundColor: tone.fg }, pulse && !reduced ? { opacity: glow } : null]}
      />
      <Text style={[s.chipText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

// ── Stat ──

export function Stat({
  label, value, tone, align = 'left',
}: { label: string; value: string; tone?: string; align?: 'left' | 'right' }) {
  const s = useUi();
  return (
    <View style={[s.stat, align === 'right' && { alignItems: 'flex-end' }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ── Buttons ──

export function PrimaryButton({
  title, onPress, busy = false, disabled = false,
}: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const s = useUi();
  const t = useTheme();
  const inert = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy }}
      accessibilityLabel={title}
      style={({ pressed }) => [s.primary, pressed && s.pressed, inert && { opacity: 0.55 }]}>
      <Text style={[s.primaryText, { color: t.onAccent }]}>{busy ? 'Working…' : title}</Text>
    </Pressable>
  );
}

export function GhostButton({
  title, onPress, tone,
}: { title: string; onPress: () => void; tone?: string }) {
  const s = useUi();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      hitSlop={8}
      style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
      <Text style={[s.ghostText, tone ? { color: tone } : null]}>{title}</Text>
    </Pressable>
  );
}

/** A whole row that behaves as one control. */
export function Tappable({ children, style, ...rest }: PressableProps & { children: React.ReactNode }) {
  const s = useUi();
  return (
    <Pressable
      {...rest}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && s.tapped,
      ]}>
      {children}
    </Pressable>
  );
}

// ── Segmented control ──

const TRACK_PAD = 2;

export function Segmented<T extends string>({
  options, value, onChange, accessibilityLabel, format,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel?: string;
  /** Display text for an option, when it differs from the value itself. */
  format?: (option: T) => string;
}) {
  const s = useUi();
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  const index = Math.max(0, options.indexOf(value));
  // The track has 2pt of padding and a hairline border on each side; cells
  // divide what's inside that, and so must the thumb, or it drifts off the
  // cell it is meant to sit behind by a little more with each step right.
  const inner = Math.max(0, width - 2 * (TRACK_PAD + StyleSheet.hairlineWidth));
  const cell = options.length > 0 ? inner / options.length : 0;

  useEffect(() => {
    const to = index * cell;
    if (reduced || cell === 0) {
      slide.setValue(to);
      return;
    }
    Animated.spring(slide, {
      toValue: to, useNativeDriver: true, speed: 20, bounciness: 4,
    }).start();
  }, [index, cell, slide, reduced]);

  return (
    <View
      style={s.segTrack}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}>
      {cell > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[s.segThumb, { width: cell, transform: [{ translateX: slide }] }]}
        />
      )}
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={format ? format(opt) : opt}
            style={s.segCell}>
            <Text style={[s.segText, { color: active ? t.ink : t.inkDim }]} numberOfLines={1}>
              {format ? format(opt) : opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Skeleton ──

export function Skeleton({ width, height, radius: r = radius.sm }: {
  width: number | `${number}%`; height: number; radius?: number;
}) {
  const s = useUi();
  const pulse = useRef(new Animated.Value(0.45)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[s.skeleton, { width, height, borderRadius: r }, reduced ? null : { opacity: pulse }]}
    />
  );
}

// ── Entrance animation ──

/**
 * A short rise-and-fade on first paint. Staggered by index so a list of cards
 * resolves in order rather than all at once, which reads as one deliberate
 * motion instead of a flicker.
 */
export function Appear({
  children, index = 0, style,
}: { children: React.ReactNode; index?: number; style?: ViewStyle }) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 380,
      delay: Math.min(index, 6) * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, index, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

// ── Styles ──

const useUi = makeStyles((t) => ({
  label: {
    fontSize: type.micro,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: t.inkFaint,
    fontWeight: '700',
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm + 1,
    paddingVertical: space.xs + 1,
    borderRadius: radius.sm,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: {
    fontSize: type.micro + 0.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  stat: { flexGrow: 1, flexBasis: '33.333%', paddingVertical: space.sm + 2, paddingHorizontal: space.md, gap: 3 },
  statLabel: {
    fontSize: type.micro,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: t.inkFaint,
    fontWeight: '700',
  },
  statValue: { fontFamily: mono, fontSize: type.label, fontWeight: '700', color: t.ink, ...tabular },

  primary: {
    backgroundColor: t.accent,
    borderRadius: radius.md,
    paddingVertical: space.lg - 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryText: { fontSize: type.body + 1, fontWeight: '700', letterSpacing: 0.1 },

  ghost: { paddingVertical: space.xs },
  ghostText: { fontSize: type.label, fontWeight: '600', color: t.inkDim },

  pressed: { opacity: 0.65 },
  tapped: { backgroundColor: t.accentSoft },

  segTrack: {
    flexDirection: 'row',
    backgroundColor: t.sunk,
    borderRadius: radius.sm + 2,
    padding: TRACK_PAD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.rule,
  },
  segThumb: {
    position: 'absolute',
    top: TRACK_PAD,
    left: TRACK_PAD,
    bottom: TRACK_PAD,
    borderRadius: radius.sm,
    backgroundColor: t.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ruleStrong,
  },
  segCell: { flex: 1, alignItems: 'center', paddingVertical: space.sm - 2 },
  segText: { fontSize: type.caption + 0.5, fontWeight: '700', letterSpacing: 0.3 },

  skeleton: { backgroundColor: t.sunk },
}));
