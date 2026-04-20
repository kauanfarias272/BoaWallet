import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface BoaPeerProfile {
  app: 'BoaWallet';
  v: 1;
  userId: string;
  username: string;
  name?: string;
}

export interface NfcStatus {
  available: boolean;
  enabled: boolean;
  hceSupported: boolean;
  hasPayload: boolean;
}

export interface NfcScanHandle {
  stop: () => void;
}

interface NativeNfcBridgePlugin {
  getStatus(): Promise<NfcStatus>;
  setProfilePayload(options: { userId: string; username: string; name?: string }): Promise<void>;
  clearProfilePayload(): Promise<void>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  addListener(
    eventName: 'profileDiscovered',
    listenerFunc: (profile: BoaPeerProfile) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'scanError',
    listenerFunc: (event: { message: string; code?: string }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const NfcBridge = registerPlugin<NativeNfcBridgePlugin>('NfcBridge');

const isNativeAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function isNfcSupported(): boolean {
  return isNativeAndroid();
}

export async function getNfcStatus(): Promise<NfcStatus> {
  if (!isNativeAndroid()) {
    return {
      available: false,
      enabled: false,
      hceSupported: false,
      hasPayload: false,
    };
  }

  return NfcBridge.getStatus();
}

export async function prepareNfcProfileBroadcast(
  profile: Omit<BoaPeerProfile, 'app' | 'v'>
): Promise<void> {
  if (!isNativeAndroid()) return;

  await NfcBridge.setProfilePayload(profile);
}

export async function clearNfcProfileBroadcast(): Promise<void> {
  if (!isNativeAndroid()) return;

  await NfcBridge.clearProfilePayload();
}

export async function startNfcScan(
  onProfile: (profile: BoaPeerProfile) => void,
  onError?: (err: Error) => void
): Promise<NfcScanHandle> {
  if (!isNativeAndroid()) {
    throw new Error('NFC is only available in the Android app.');
  }

  const listenerHandles: PluginListenerHandle[] = [];

  try {
    listenerHandles.push(
      await NfcBridge.addListener('profileDiscovered', (profile) => {
        onProfile(profile);
      })
    );

    listenerHandles.push(
      await NfcBridge.addListener('scanError', ({ message, code }) => {
        const error = new Error(message || 'NFC scan failed');
        (error as Error & { code?: string }).code = code;
        onError?.(error);
      })
    );

    await NfcBridge.startScan();
  } catch (rawError) {
    await Promise.all(listenerHandles.map((handle) => handle.remove()));
    const message =
      rawError instanceof Error ? rawError.message : String(rawError || 'NFC scan failed');
    throw new Error(message);
  }

  return {
    stop: () => {
      void NfcBridge.stopScan();
      void Promise.all(listenerHandles.map((handle) => handle.remove()));
    },
  };
}
