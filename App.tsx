import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from './src/theme';
import { loadToken } from './src/storage/token';
import ErrorBoundary from './src/components/ErrorBoundary';
import SetupScreen from './src/screens/SetupScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import { SAMPLE_MODE } from './src/dev/sample';

type Boot = { phase: 'reading' } | { phase: 'ready'; token: string | null };

export default function App() {
  const theme = useTheme();
  const [boot, setBoot] = useState<Boot>({ phase: 'reading' });

  // The root view's colour shows during launch, rotation and keyboard
  // transitions. Left at its default it flashes white under a dark UI.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.ground).catch(() => {});
  }, [theme.ground]);

  const readToken = useCallback(async () => {
    setBoot({ phase: 'ready', token: SAMPLE_MODE ? 'sample' : await loadToken() });
  }, []);

  useEffect(() => {
    readToken();
  }, [readToken]);

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.ground }} edges={['top', 'left', 'right']}>
        <ErrorBoundary>
          {boot.phase === 'reading' ? (
            // A keychain read takes milliseconds. A spinner here would only
            // flicker; the bare ground is the honest placeholder.
            <View style={{ flex: 1, backgroundColor: theme.ground }} />
          ) : boot.token ? (
            <PortfolioScreen
              key={boot.token}
              token={boot.token}
              onDisconnect={() => setBoot({ phase: 'ready', token: null })}
            />
          ) : (
            <SetupScreen onSaved={readToken} />
          )}
        </ErrorBoundary>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
