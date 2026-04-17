/**
 * BoaWallet NFC Proximity — Beta
 *
 * Usa a Web NFC API (NDEFReader) disponível no Chrome 89+ Android.
 * Em WebView Capacitor, funciona quando o device suporta NFC e a permissão
 * foi concedida. Em iOS / desktop o feature é ignorado graciosamente.
 */

export interface NfcBoaProfile {
  app: 'BoaWallet';
  v: 1;
  userId: string;
  username: string;
  name?: string;
}

const PREFIX = 'boa:';

/** Verifica se a Web NFC API está disponível no ambiente atual. */
export function isNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

export interface NfcScanHandle {
  stop: () => void;
}

/**
 * Inicia o escaneamento NFC em background.
 * Chama `onProfile` cada vez que um perfil BoaWallet é lido via NFC.
 * Retorna um handle com `.stop()` para encerrar o scan.
 */
export async function startNfcScan(
  onProfile: (profile: NfcBoaProfile) => void,
  onError?: (err: Error) => void
): Promise<NfcScanHandle> {
  if (!isNfcSupported()) {
    throw new Error('NotSupportedError: NDEFReader not available');
  }

  const controller = new AbortController();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reader = new (window as any).NDEFReader();

  reader.addEventListener('reading', ({ message }: any) => {
    for (const record of message.records) {
      try {
        const text: string = new TextDecoder().decode(record.data);
        if (!text.startsWith(PREFIX)) continue;
        const profile = JSON.parse(text.slice(PREFIX.length)) as NfcBoaProfile;
        if (profile.app === 'BoaWallet' && profile.userId && profile.username) {
          onProfile(profile);
        }
      } catch {
        // registro malformado — ignora
      }
    }
  });

  reader.addEventListener('readingerror', () => {
    onError?.(new Error('NFC reading error'));
  });

  try {
    await reader.scan({ signal: controller.signal });
  } catch (rawErr: any) {
    // Re-throw with the DOMException name prepended so callers can detect it
    const name: string = rawErr?.name || '';
    const message: string = rawErr?.message || String(rawErr);
    const enriched = new Error(`${name}: ${message}`);
    (enriched as any).originalName = name;
    throw enriched;
  }

  return { stop: () => controller.abort() };
}

/**
 * Escreve o perfil do usuário atual num tag NFC / dispositivo próximo.
 * Ambos os dispositivos devem se aproximar — um escreve, o outro lê.
 */
export async function writeNfcProfile(
  profile: Omit<NfcBoaProfile, 'app' | 'v'>
): Promise<void> {
  if (!isNfcSupported()) {
    throw new Error('NFC not supported');
  }

  const full: NfcBoaProfile = { ...profile, app: 'BoaWallet', v: 1 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = new (window as any).NDEFReader();
  await writer.write({
    records: [{ recordType: 'text', data: PREFIX + JSON.stringify(full), lang: 'pt' }],
  });
}
