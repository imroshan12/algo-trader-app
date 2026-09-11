/**
 * Last line of defence against a render crash.
 *
 * Without this, one malformed value reaching a component takes the whole app
 * down to a blank screen in a release build — no message, no way back
 * except force-quitting. This shows what failed and offers a reset, which
 * remounts the tree and refetches.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { makeStyles, mono, radius, space, type } from '../theme';
import { PrimaryButton } from './ui';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Visible in Xcode / logcat for a device build; there is no crash
    // reporter wired up, and this app has nothing to send one to.
    console.error('Render failure', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <Fallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function Fallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const s = useStyles();
  return (
    <View style={s.root}>
      <Text style={s.title}>Something went wrong</Text>
      <Text style={s.body}>
        The app hit an error drawing this screen. Your portfolio is unaffected — this is a
        display problem on this device only.
      </Text>
      <View style={s.detail}>
        <Text style={s.detailText} selectable numberOfLines={6}>{error.message}</Text>
      </View>
      <PrimaryButton title="Reload" onPress={onReset} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.ground, justifyContent: 'center', padding: space.xl, gap: space.lg },
  title: { fontSize: type.title, fontWeight: '700', color: t.ink, letterSpacing: -0.4 },
  body: { fontSize: type.body, lineHeight: 23, color: t.inkDim },
  detail: { backgroundColor: t.sunk, borderRadius: radius.sm, padding: space.md },
  detailText: { fontFamily: mono, fontSize: type.caption, color: t.inkDim, lineHeight: 17 },
}));
