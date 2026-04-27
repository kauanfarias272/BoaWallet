import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const REFRESH_TOKEN_KEY = 'boa_refresh_token';
const ACCESS_TOKEN_KEY = 'boa_access_token';

export async function persistSessionTokens(refreshToken: string, accessToken: string): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return;
  await Preferences.set({ key: REFRESH_TOKEN_KEY, value: refreshToken });
  await Preferences.set({ key: ACCESS_TOKEN_KEY, value: accessToken });
}

export async function loadPersistedTokens(): Promise<{ refreshToken: string | null; accessToken: string | null }> {
  if (Capacitor.getPlatform() === 'web') return { refreshToken: null, accessToken: null };
  const refresh = await Preferences.get({ key: REFRESH_TOKEN_KEY });
  const access = await Preferences.get({ key: ACCESS_TOKEN_KEY });
  return { refreshToken: refresh.value, accessToken: access.value };
}

export async function clearPersistedTokens(): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return;
  await Preferences.remove({ key: REFRESH_TOKEN_KEY });
  await Preferences.remove({ key: ACCESS_TOKEN_KEY });
}
