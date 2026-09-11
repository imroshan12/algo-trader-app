/**
 * First run: get a read-only token into the keychain.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';

import { makeStyles, mono, radius, space, type, useTheme } from '../theme';
import { verifyAccess, DEFAULT_REPO, isAbortError } from '../api/github';
import { saveToken } from '../storage/token';
import { Appear, Label, PrimaryButton } from '../components/ui';
import { classifyToken } from '../lib/token';

interface Props {
  onSaved: () => void;
}

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export default function SetupScreen({ onSaved }: Props) {
  const s = useStyles();
  const t = useTheme();
  const [token, setToken] = useState('');
  const [reveal, setReveal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const kind = classifyToken(token);

  async function connect() {
    const trimmed = token.trim();
    if (!trimmed) {
      setError('Paste your token first.');
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setChecking(true);
    setError(null);
    try {
      const result = await verifyAccess(trimmed, DEFAULT_REPO, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        await saveToken(trimmed);
        onSaved();
        return;
      }
      setError(result.message);
    } catch (e) {
      if (isAbortError(e)) return;
      setError('Could not reach GitHub.');
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  }

  const hint =
    kind === 'fine-grained' ? { text: 'Fine-grained token', color: t.gain }
    : kind === 'classic' ? {
        text: 'This is a classic token, which can read every repository on your account. It will work, but a fine-grained token limited to one repository is safer.',
        color: t.idle,
      }
    : kind === 'unknown' ? { text: "This doesn't look like a GitHub token.", color: t.idle }
    : null;

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Appear style={s.intro}>
          <Mark />
          <Text style={s.title}>Connect your portfolio</Text>
          <Text style={s.body}>
            Your paper-trading state lives in{' '}
            <Text style={s.code}>{DEFAULT_REPO.owner}/{DEFAULT_REPO.repo}</Text>. That
            repository is private, so this app needs a read-only token to see it. The token is
            kept in this device's keychain and is never sent anywhere except GitHub.
          </Text>
        </Appear>

        <Appear index={1} style={s.steps}>
          <Step n={1} text="Open GitHub's fine-grained token page." />
          <Step n={2} text={`Under Repository access, choose Only select repositories → ${DEFAULT_REPO.repo}.`} />
          <Step n={3} text="Under Permissions, set Contents to Read-only. Nothing else is needed." />
          <Step n={4} text="Generate the token and paste it below." last />
        </Appear>

        <Pressable
          onPress={() => Linking.openURL(TOKEN_URL)}
          accessibilityRole="link"
          style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
          <Text style={s.linkText}>Open GitHub token settings ↗</Text>
        </Pressable>

        <View style={s.field}>
          <View style={s.fieldHead}>
            <Label>Access token</Label>
            {token ? (
              <Pressable
                onPress={() => setReveal((r) => !r)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={reveal ? 'Hide token' : 'Show token'}>
                <Text style={s.reveal}>{reveal ? 'Hide' : 'Show'}</Text>
              </Pressable>
            ) : null}
          </View>
          <TextInput
            value={token}
            onChangeText={(v) => { setToken(v); setError(null); }}
            placeholder="github_pat_…"
            placeholderTextColor={t.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="password"
            secureTextEntry={!reveal}
            spellCheck={false}
            style={[s.input, error ? { borderColor: t.loss } : null]}
            onSubmitEditing={connect}
            returnKeyType="go"
            accessibilityLabel="GitHub access token"
          />
          {error ? (
            <Text style={[s.hint, { color: t.loss }]} accessibilityLiveRegion="polite">{error}</Text>
          ) : hint ? (
            <Text style={[s.hint, { color: hint.color }]}>{hint.text}</Text>
          ) : null}
        </View>

        <PrimaryButton title="Connect" onPress={connect} busy={checking} disabled={kind === 'empty'} />

        <Text style={s.footnote}>
          Read-only. The app never commits, never triggers workflows, and cannot affect the
          scheduled job that maintains your portfolio.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  const s = useStyles();
  return (
    <View style={[s.step, !last && s.stepDivider]}>
      <Text style={s.stepNum}>{n}</Text>
      <Text style={s.stepText}>{text}</Text>
    </View>
  );
}

/** The app's mark is its own chart: sessions rising and falling from a baseline. */
function Mark() {
  const s = useStyles();
  const t = useTheme();
  const bars: [number, 'up' | 'down'][] = [[0.35, 'up'], [0.2, 'down'], [0.55, 'up'], [0.8, 'up'], [0.45, 'up']];
  return (
    <View style={s.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.markBase} />
      {bars.map(([h, dir], i) => (
        <View key={i} style={s.markCol}>
          <View
            style={[
              s.markBar,
              {
                height: h * 20,
                backgroundColor: dir === 'up' ? t.gain : t.loss,
                opacity: i === bars.length - 1 ? 1 : 0.55,
              },
              dir === 'up' ? { bottom: 20 } : { top: 20 },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, backgroundColor: t.ground },
  scroll: { padding: space.xl, paddingTop: space.xxl + space.sm, paddingBottom: space.xxl, gap: space.xl },

  intro: { gap: space.md },
  title: { fontSize: 28, fontWeight: '700', color: t.ink, letterSpacing: -0.6 },
  body: { fontSize: type.body, lineHeight: 23, color: t.inkDim },
  code: { fontFamily: mono, fontSize: type.label + 0.5, color: t.ink },

  steps: {
    backgroundColor: t.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ruleStrong,
    paddingHorizontal: space.lg,
  },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.md + 2 },
  stepDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.rule },
  stepNum: {
    fontFamily: mono,
    fontSize: type.caption + 0.5,
    fontWeight: '700',
    color: t.accent,
    backgroundColor: t.accentSoft,
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: type.label + 1, lineHeight: 21, color: t.ink },

  link: { alignSelf: 'flex-start', paddingVertical: space.xs, marginTop: -space.sm },
  linkText: { color: t.accent, fontSize: type.body, fontWeight: '600' },

  field: { gap: space.sm },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reveal: { fontSize: type.label, fontWeight: '600', color: t.accent },
  input: {
    fontFamily: mono,
    fontSize: type.label + 1,
    color: t.ink,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.ruleStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.lg - 2,
    paddingVertical: space.lg - 2,
  },
  hint: { fontSize: type.label, lineHeight: 19 },

  footnote: { fontSize: type.caption + 0.5, lineHeight: 19, color: t.inkFaint },

  mark: { flexDirection: 'row', width: 64, height: 40, gap: 4, marginBottom: space.xs },
  markBase: { position: 'absolute', left: 0, right: 0, top: 20, height: StyleSheet.hairlineWidth, backgroundColor: t.ruleStrong },
  markCol: { flex: 1 },
  markBar: { position: 'absolute', left: 0, right: 0, borderRadius: 1 },
}));
