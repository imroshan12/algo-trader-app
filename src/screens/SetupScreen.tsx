import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { Palette, mono } from '../theme';
import { verifyAccess, DEFAULT_REPO } from '../api/github';
import { saveToken } from '../storage/token';

interface Props {
  palette: Palette;
  onSaved: () => void;
}

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export default function SetupScreen({ palette, onSaved }: Props) {
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = styles(palette);

  async function connect() {
    const trimmed = token.trim();
    if (!trimmed) {
      setError('Paste your token first.');
      return;
    }
    setChecking(true);
    setError(null);
    const result = await verifyAccess(trimmed);
    if (result.ok) {
      await saveToken(trimmed);
      onSaved();
    } else {
      setError(result.message);
      setChecking(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>First run</Text>
        <Text style={s.title}>Connect your repository</Text>
        <Text style={s.body}>
          This app reads your paper-trading state from{' '}
          <Text style={s.code}>{DEFAULT_REPO.owner}/{DEFAULT_REPO.repo}</Text>. Because that
          repository is private, it needs a read-only access token. The token is stored in
          your device keychain and never leaves the phone.
        </Text>

        <View style={s.steps}>
          <Step palette={palette} n="1" text="Open GitHub's fine-grained token page." />
          <Step palette={palette} n="2" text={`Under Repository access, select only ${DEFAULT_REPO.repo}.`} />
          <Step palette={palette} n="3" text="Under Permissions, set Contents to Read-only. Nothing else is needed." />
          <Step palette={palette} n="4" text="Generate it, then paste it below." />
        </View>

        <Pressable
          onPress={() => Linking.openURL(TOKEN_URL)}
          style={({ pressed }) => [s.link, pressed && s.pressed]}>
          <Text style={s.linkText}>Open GitHub token settings ↗</Text>
        </Pressable>

        <TextInput
          value={token}
          onChangeText={(t) => { setToken(t); setError(null); }}
          placeholder="github_pat_..."
          placeholderTextColor={palette.inkDim}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={s.input}
          onSubmitEditing={connect}
          returnKeyType="go"
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Pressable
          onPress={connect}
          disabled={checking}
          style={({ pressed }) => [s.button, (pressed || checking) && s.pressed]}>
          {checking
            ? <ActivityIndicator color={palette.surface} />
            : <Text style={s.buttonText}>Connect</Text>}
        </Pressable>

        <Text style={s.footnote}>
          Read-only. The app never commits, never triggers workflows, and cannot affect the
          scheduled job that maintains your portfolio.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ palette, n, text }: { palette: Palette; n: string; text: string }) {
  const s = styles(palette);
  return (
    <View style={s.step}>
      <Text style={s.stepNum}>{n}</Text>
      <Text style={s.stepText}>{text}</Text>
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: p.ground },
    scroll: { padding: 24, paddingTop: 40, gap: 16 },
    eyebrow: {
      fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
      color: p.inkDim, fontWeight: '700',
    },
    title: { fontSize: 26, fontWeight: '700', color: p.ink, letterSpacing: -0.5 },
    body: { fontSize: 15, lineHeight: 23, color: p.inkDim },
    code: { fontFamily: mono, fontSize: 13.5, color: p.ink },
    steps: {
      gap: 12, padding: 16, backgroundColor: p.surface,
      borderRadius: 8, borderWidth: 1, borderColor: p.rule,
    },
    step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    stepNum: {
      fontFamily: mono, fontSize: 12, fontWeight: '700', color: p.accent,
      backgroundColor: p.accentSoft, width: 22, height: 22, borderRadius: 11,
      textAlign: 'center', lineHeight: 22, overflow: 'hidden',
    },
    stepText: { flex: 1, fontSize: 14, lineHeight: 21, color: p.ink },
    link: { paddingVertical: 4 },
    linkText: { color: p.accent, fontSize: 15, fontWeight: '600' },
    input: {
      fontFamily: mono, fontSize: 14, color: p.ink, backgroundColor: p.surface,
      borderWidth: 1, borderColor: p.rule, borderRadius: 8,
      paddingHorizontal: 14, paddingVertical: 14,
    },
    error: { color: p.loss, fontSize: 14, lineHeight: 20 },
    button: {
      backgroundColor: p.accent, borderRadius: 8, paddingVertical: 15,
      alignItems: 'center', justifyContent: 'center', minHeight: 50,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    pressed: { opacity: 0.7 },
    footnote: { fontSize: 12.5, lineHeight: 19, color: p.inkDim, marginTop: 4 },
  });
