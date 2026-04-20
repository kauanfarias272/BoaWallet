export interface BitcoinWalletLoginConfig {
  base: string;
  invoiceKey: string;
  adminKey: string;
}

export interface BitcoinWalletValidationResult {
  walletName: string;
  balanceSats: number;
  normalizedConfig: BitcoinWalletLoginConfig;
}

const STORAGE_KEYS = {
  base: 'boawallet_lnbits_base',
  invoiceKey: 'boawallet_lnbits_invoice_key',
  adminKey: 'boawallet_lnbits_admin_key',
} as const;

const textEncoder = new TextEncoder();

export function normalizeBitcoinWalletLoginConfig(
  config: Partial<BitcoinWalletLoginConfig>
): BitcoinWalletLoginConfig {
  return {
    base: String(config.base || '').trim().replace(/\/+$/, ''),
    invoiceKey: String(config.invoiceKey || '').trim(),
    adminKey: String(config.adminKey || '').trim(),
  };
}

export function readBitcoinWalletLoginConfig(): BitcoinWalletLoginConfig {
  try {
    return normalizeBitcoinWalletLoginConfig({
      base: localStorage.getItem(STORAGE_KEYS.base) || '',
      invoiceKey: localStorage.getItem(STORAGE_KEYS.invoiceKey) || '',
      adminKey: localStorage.getItem(STORAGE_KEYS.adminKey) || '',
    });
  } catch {
    return normalizeBitcoinWalletLoginConfig({});
  }
}

export function persistBitcoinWalletLoginConfig(config: BitcoinWalletLoginConfig) {
  const normalized = normalizeBitcoinWalletLoginConfig(config);

  try {
    if (normalized.base) localStorage.setItem(STORAGE_KEYS.base, normalized.base);
    else localStorage.removeItem(STORAGE_KEYS.base);

    if (normalized.invoiceKey) localStorage.setItem(STORAGE_KEYS.invoiceKey, normalized.invoiceKey);
    else localStorage.removeItem(STORAGE_KEYS.invoiceKey);

    if (normalized.adminKey) localStorage.setItem(STORAGE_KEYS.adminKey, normalized.adminKey);
    else localStorage.removeItem(STORAGE_KEYS.adminKey);
  } catch {
    // Ignore storage errors on restricted browsers/webviews.
  }
}

async function requestWalletInfo(base: string, apiKey: string) {
  const response = await fetch(`${base}/api/v1/wallet`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw.trim();

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.detail === 'string' && parsed.detail.trim()) {
        message = parsed.detail.trim();
      } else if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        message = parsed.message.trim();
      }
    } catch {
      // Keep raw response text when JSON parsing fails.
    }

    throw new Error(message || `LNbits ${response.status}`);
  }

  return response.json();
}

function fallbackHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
}

async function sha256Hex(value: string) {
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(value));
      return Array.from(new Uint8Array(digest))
        .map((part) => part.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fall back to the deterministic hash below.
  }

  return `${fallbackHash(value)}${fallbackHash(`boa:${value}`)}${fallbackHash(`${value}:wallet`)}`.repeat(2).slice(0, 64);
}

export async function validateBitcoinWalletLoginConfig(
  config: BitcoinWalletLoginConfig
): Promise<BitcoinWalletValidationResult> {
  const normalized = normalizeBitcoinWalletLoginConfig(config);

  if (!normalized.base || !normalized.invoiceKey || !normalized.adminKey) {
    throw new Error('Informe a Base URL, a invoice key e a admin key da sua carteira LNbits.');
  }

  const keysToTry = [normalized.adminKey, normalized.invoiceKey];
  let lastError: Error | null = null;

  for (const apiKey of keysToTry) {
    try {
      const wallet = await requestWalletInfo(normalized.base, apiKey);
      return {
        walletName: String(wallet?.name || 'Bitcoin Wallet'),
        balanceSats: Math.floor(Number(wallet?.balance || 0) / 1000),
        normalizedConfig: normalized,
      };
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Nao foi possivel validar sua carteira Bitcoin.');
}

export async function deriveBitcoinWalletCredentials(config: BitcoinWalletLoginConfig) {
  const normalized = normalizeBitcoinWalletLoginConfig(config);
  const fingerprint = await sha256Hex(
    `boa-wallet-bitcoin-login:${normalized.base}|${normalized.invoiceKey}|${normalized.adminKey}`
  );

  return {
    fingerprint,
    email: `btc-${fingerprint.slice(0, 24)}@wallet.boawallet.app`,
    password: `BoaWallet#${fingerprint.slice(0, 32)}!${fingerprint.slice(32, 48)}`,
    normalizedConfig: normalized,
  };
}
