/**
 * Token storage.
 *
 * The GitHub PAT lives in the device keychain (iOS) / keystore (Android) via
 * expo-secure-store, not in AsyncStorage and never in the JS bundle. It is a
 * fine-grained, read-only token scoped to a single repository — the worst case
 * if it leaks is that someone can read a paper-trading portfolio.
 *
 * Do not ship a build of this app to a public store with a token baked in.
 * The token is entered by the user on first run and stays on their device.
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'algotrader.github.pat';

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token.trim(), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing stored — treat as already cleared.
  }
}
