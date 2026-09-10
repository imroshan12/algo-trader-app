import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { dark, light } from './src/theme';
import { loadToken } from './src/storage/token';
import SetupScreen from './src/screens/SetupScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';

export default function App() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? dark : light;

  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function refreshToken() {
    setToken(await loadToken());
    setReady(true);
  }

  useEffect(() => {
    refreshToken();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView
        style={[styles.flex, { backgroundColor: palette.ground }]}
        edges={['top', 'left', 'right']}>
        {!ready ? (
          <View style={[styles.center, { backgroundColor: palette.ground }]}>
            <ActivityIndicator color={palette.accent} size="large" />
          </View>
        ) : token ? (
          <PortfolioScreen
            palette={palette}
            token={token}
            onDisconnect={() => setToken(null)}
          />
        ) : (
          <SetupScreen palette={palette} onSaved={refreshToken} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
