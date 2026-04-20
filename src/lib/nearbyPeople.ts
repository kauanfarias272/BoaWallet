import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { BoaPeerProfile } from './nfc';

export interface NearbyStatus {
  available: boolean;
  permissionsOk: boolean;
  needsLocation: boolean;
}

export interface NearbySessionHandle {
  stop: () => void;
}

interface NativeNearbyPeoplePlugin {
  getStatus(): Promise<NearbyStatus>;
  startSession(options: { userId: string; username: string; name?: string }): Promise<void>;
  stopSession(): Promise<void>;
  addListener(
    eventName: 'personDiscovered',
    listenerFunc: (profile: BoaPeerProfile) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'sessionError',
    listenerFunc: (event: { message: string; code?: string }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const NearbyPeople = registerPlugin<NativeNearbyPeoplePlugin>('NearbyPeople');

const isNativeAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function isNearbySupported(): boolean {
  return isNativeAndroid();
}

export async function getNearbyStatus(): Promise<NearbyStatus> {
  if (!isNativeAndroid()) {
    return {
      available: false,
      permissionsOk: false,
      needsLocation: false,
    };
  }

  return NearbyPeople.getStatus();
}

export async function startNearbySession(
  profile: Omit<BoaPeerProfile, 'app' | 'v'>,
  onPerson: (profile: BoaPeerProfile) => void,
  onError?: (error: Error) => void,
): Promise<NearbySessionHandle> {
  if (!isNativeAndroid()) {
    throw new Error('Nearby discovery is only available in the Android app.');
  }

  const listenerHandles: PluginListenerHandle[] = [];

  try {
    listenerHandles.push(
      await NearbyPeople.addListener('personDiscovered', (person) => {
        onPerson(person);
      })
    );

    listenerHandles.push(
      await NearbyPeople.addListener('sessionError', ({ message, code }) => {
        const error = new Error(message || 'Nearby discovery failed');
        (error as Error & { code?: string }).code = code;
        onError?.(error);
      })
    );

    await NearbyPeople.startSession(profile);
  } catch (rawError) {
    await Promise.all(listenerHandles.map((handle) => handle.remove()));
    const message =
      rawError instanceof Error ? rawError.message : String(rawError || 'Nearby discovery failed');
    throw new Error(message);
  }

  return {
    stop: () => {
      void NearbyPeople.stopSession();
      void Promise.all(listenerHandles.map((handle) => handle.remove()));
    },
  };
}
