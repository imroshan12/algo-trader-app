/**
 * Design tokens.
 *
 * The visual reference is an instrument cluster, not a broker app: cool
 * slate neutrals, hairline rules, and figures set in a tabular face. Colour
 * carries meaning and nothing else — `gain` / `loss` / `idle` are reserved
 * for what the money is doing, and `accent` is never used to mean "good".
 * That separation is the whole reason a red number reads instantly.
 *
 * Neutrals are biased very slightly blue so they sit under the accent
 * without looking like undecided grey.
 */

import { Platform, StyleSheet, useColorScheme } from 'react-native';

export interface Palette {
  /** Page background. */
  ground: string;
  /** Cards and sheets. */
  surface: string;
  /** A surface that needs to read as lifted off another surface. */
  raised: string;
  /** Recessed strips inside a surface — stat bars, chart wells. */
  sunk: string;

  ink: string;
  inkDim: string;
  inkFaint: string;

  rule: string;
  ruleStrong: string;

  accent: string;
  accentSoft: string;
  /** Text that sits on top of a filled accent surface. */
  onAccent: string;

  gain: string;
  gainSoft: string;
  loss: string;
  lossSoft: string;
  /** Deliberately holding cash — a state, not a failure. */
  idle: string;
  idleSoft: string;

  /** Sheet backdrop. */
  scrim: string;
}

const lightPalette: Palette = {
  ground: '#eef1f5',
  surface: '#ffffff',
  raised: '#ffffff',
  sunk: '#e7ebf1',

  ink: '#11151a',
  inkDim: '#5c6674',
  inkFaint: '#8b95a3',

  rule: '#dde2e9',
  ruleStrong: '#c7cfda',

  accent: '#2f5580',
  accentSoft: 'rgba(47,85,128,0.10)',
  onAccent: '#ffffff',

  gain: '#0f7a4d',
  gainSoft: 'rgba(15,122,77,0.12)',
  loss: '#b32d3f',
  lossSoft: 'rgba(179,45,63,0.12)',
  idle: '#856b2c',
  idleSoft: 'rgba(133,107,44,0.12)',

  scrim: 'rgba(17,21,26,0.35)',
};

const darkPalette: Palette = {
  ground: '#0b0e12',
  surface: '#141920',
  raised: '#1a212a',
  sunk: '#0f141a',

  ink: '#e6eaef',
  inkDim: '#8791a0',
  inkFaint: '#5b6675',

  rule: '#222932',
  ruleStrong: '#303945',

  accent: '#7ba0cc',
  accentSoft: 'rgba(123,160,204,0.14)',
  onAccent: '#0b0e12',

  gain: '#3fb27f',
  gainSoft: 'rgba(63,178,127,0.15)',
  loss: '#e8697a',
  lossSoft: 'rgba(232,105,122,0.15)',
  idle: '#c9ae72',
  idleSoft: 'rgba(201,174,114,0.15)',

  scrim: 'rgba(0,0,0,0.5)',
};

export interface Theme extends Palette {
  isDark: boolean;
}

const lightTheme: Theme = { ...lightPalette, isDark: false };
const darkTheme: Theme = { ...darkPalette, isDark: true };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/** 4pt grid. Every gap and pad in the app comes from here. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Figures are set in a monospaced face so a column of rupee amounts lines up
 * on the decimal. `fontVariant: tabular-nums` does the same job for the
 * system face where a mono face would be too heavy — labels, chips.
 */
export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

export const tabular = { fontVariant: ['tabular-nums' as const] };

/** One scale, used everywhere. Sizes are in points. */
export const type = {
  hero: 38,
  title: 24,
  heading: 17,
  body: 15,
  label: 13,
  caption: 11.5,
  micro: 10,
} as const;

/**
 * Style factories are memoised on the theme object.
 *
 * `StyleSheet.create` inside a render allocates a new sheet on every pass and
 * defeats the equality checks RN uses to skip re-styling. There are exactly
 * two theme objects in the process, so this cache never holds more than two
 * entries.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  build: (t: Theme) => T & StyleSheet.NamedStyles<T>,
): () => T {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let sheet = cache.get(theme);
    if (!sheet) {
      sheet = StyleSheet.create(build(theme));
      cache.set(theme, sheet);
    }
    return sheet;
  };
}

/** Semantic colour for a signed number. Zero is neutral, not green. */
export function toneFor(theme: Theme, n: number, neutral = theme.ink): string {
  if (n > 0) return theme.gain;
  if (n < 0) return theme.loss;
  return neutral;
}
