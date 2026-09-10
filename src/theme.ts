/**
 * Instrument-panel palette. Cool slate-biased neutrals so the semantic
 * gain/loss colours carry all the signal — the accent is used only for
 * structure and pending state, never to mean "good" or "bad".
 */

import { Platform } from 'react-native';

export interface Palette {
  ground: string;
  surface: string;
  sunk: string;
  ink: string;
  inkDim: string;
  rule: string;
  accent: string;
  accentSoft: string;
  gain: string;
  loss: string;
  gainFill: string;
  lossFill: string;
  idle: string;
  idleSoft: string;
}

export const light: Palette = {
  ground: '#eceff3',
  surface: '#ffffff',
  sunk: '#e3e7ec',
  ink: '#14171b',
  inkDim: '#626a74',
  rule: '#d4d9e0',
  accent: '#3d5a80',
  accentSoft: 'rgba(61,90,128,0.10)',
  gain: '#17794a',
  loss: '#b0303f',
  gainFill: 'rgba(23,121,74,0.13)',
  lossFill: 'rgba(176,48,63,0.13)',
  idle: '#8a7a52',
  idleSoft: 'rgba(138,122,82,0.12)',
};

export const dark: Palette = {
  ground: '#0e1114',
  surface: '#161a1f',
  sunk: '#1d2229',
  ink: '#e4e8ec',
  inkDim: '#8b949e',
  rule: '#242a31',
  accent: '#7ba0cc',
  accentSoft: 'rgba(123,160,204,0.14)',
  gain: '#4eb782',
  loss: '#e56b7a',
  gainFill: 'rgba(78,183,130,0.15)',
  lossFill: 'rgba(229,107,122,0.15)',
  idle: '#c4ad76',
  idleSoft: 'rgba(196,173,118,0.14)',
};

/** Tabular figures matter for a column of rupee amounts. */
export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;
