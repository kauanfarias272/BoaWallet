/**
 * BoaWallet - Lightning Network / LNbits integration
 *
 * Notes:
 * - User balances are tracked internally in Supabase.
 * - LNbits is used only to generate and settle external Lightning invoices.
 * - Runtime overrides are supported through localStorage or Vite env vars.
 */

const DEFAULT_LNBITS_BASE = 'https://gutturalmandrill5.lnbits.com';
const FALLBACK_INVOICE_KEY = 'd26d5713-4a4a-4bf8-9f61-7482444bbf56';
const FALLBACK_ADMIN_KEY = 'd26d5713-4a4a-4bf8-9f61-7482444bbf56';

type LnKeyType = 'invoice' | 'admin';

export interface LNInvoice {
  bolt11: string;
  payment_hash: string;
  amount_sats: number;
  memo: string;
  expires_at: number;
}

export interface LNPayment {
  payment_hash: string;
  amount_sats: number;
  fee_sats: number;
  memo: string;
  pending: boolean;
  created_at: number;
}

export interface LNWalletInfo {
  balance_sats: number;
  name: string;
}

const readStorageValue = (key: string) => {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key)?.trim() || '';
  } catch {
    return '';
  }
};

const readEnvValue = (key: string) => {
  try {
    return String((import.meta as any)?.env?.[key] || '').trim();
  } catch {
    return '';
  }
};

const firstNonEmpty = (...values: Array<string | undefined>) =>
  values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';

const getLnbitsConfig = () => {
  const sharedKey = firstNonEmpty(
    readStorageValue('boawallet_lnbits_key'),
    readEnvValue('VITE_LNBITS_KEY')
  );

  const invoiceKey = firstNonEmpty(
    readStorageValue('boawallet_lnbits_invoice_key'),
    readEnvValue('VITE_LNBITS_INVOICE_KEY'),
    sharedKey,
    FALLBACK_INVOICE_KEY
  );

  const adminKey = firstNonEmpty(
    readStorageValue('boawallet_lnbits_admin_key'),
    readEnvValue('VITE_LNBITS_ADMIN_KEY'),
    sharedKey,
    FALLBACK_ADMIN_KEY,
    invoiceKey
  );

  const base = firstNonEmpty(
    readStorageValue('boawallet_lnbits_base'),
    readEnvValue('VITE_LNBITS_BASE'),
    DEFAULT_LNBITS_BASE
  ).replace(/\/+$/, '');

  return { base, invoiceKey, adminKey };
};

const normalizeLnbitsError = (status: number, rawBody: string) => {
  let detail = rawBody.trim();

  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed?.detail === 'string' && parsed.detail.trim()) {
      detail = parsed.detail.trim();
    } else if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      detail = parsed.message.trim();
    }
  } catch {
    // Keep raw body
  }

  const lowered = detail.toLowerCase();
  if (status === 404 && lowered.includes('wallet not found')) {
    return 'LNbits nao encontrou a wallet configurada. Revise a chave de invoice e a chave admin desta carteira.';
  }

  if (status === 401 || status === 403) {
    return 'LNbits recusou a autenticacao. Revise as chaves configuradas para a carteira.';
  }

  return `LNbits ${status}: ${detail || 'Erro desconhecido.'}`;
};

async function lnFetch(
  path: string,
  options: RequestInit = {},
  keyType: LnKeyType = 'invoice',
  overrideKey?: string
): Promise<any> {
  const config = getLnbitsConfig();
  const apiKey = overrideKey || (keyType === 'admin' ? config.adminKey : config.invoiceKey);

  if (!apiKey) {
    throw new Error('LNbits nao configurado. Defina a chave de invoice e a chave admin da wallet.');
  }

  let response: Response;

  try {
    response = await fetch(`${config.base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        ...(options.headers ?? {}),
      },
    });
  } catch (error: any) {
    throw new Error(error?.message || 'Nao foi possivel conectar ao LNbits.');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(normalizeLnbitsError(response.status, body));
  }

  return response.json();
}

async function lnFetchWithFallback(
  path: string,
  options: RequestInit = {},
  keyOrder: LnKeyType[] = ['invoice']
) {
  const config = getLnbitsConfig();
  const attempted = new Set<string>();
  let lastError: Error | null = null;

  for (const keyType of keyOrder) {
    const apiKey = keyType === 'admin' ? config.adminKey : config.invoiceKey;
    if (!apiKey || attempted.has(apiKey)) continue;
    attempted.add(apiKey);

    try {
      return await lnFetch(path, options, keyType, apiKey);
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = String(lastError.message || '').toLowerCase();
      const canRetry =
        message.includes('wallet configurada') ||
        message.includes('autenticacao') ||
        message.includes('wallet not found') ||
        message.includes('unauthorized') ||
        message.includes('forbidden');

      if (!canRetry) break;
    }
  }

  throw lastError || new Error('Nao foi possivel completar a operacao no LNbits.');
}

export async function getWalletInfo(): Promise<LNWalletInfo> {
  const data = await lnFetchWithFallback('/api/v1/wallet', {}, ['admin', 'invoice']);
  return {
    balance_sats: Math.floor(Number(data?.balance || 0) / 1000),
    name: String(data?.name || 'LNbits'),
  };
}

export async function createInvoice(amountSats: number, memo: string): Promise<LNInvoice> {
  const data = await lnFetchWithFallback(
    '/api/v1/payments',
    {
      method: 'POST',
      body: JSON.stringify({
        out: false,
        amount: amountSats,
        memo,
        expiry: 3600,
      }),
    },
    ['invoice', 'admin']
  );

  return {
    bolt11: data?.bolt11 ?? data?.payment_request,
    payment_hash: data?.payment_hash,
    amount_sats: amountSats,
    memo,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

export async function checkInvoicePaid(paymentHash: string): Promise<boolean> {
  try {
    const data = await lnFetchWithFallback(`/api/v1/payments/${paymentHash}`, {}, ['invoice', 'admin']);
    return data?.paid === true;
  } catch {
    return false;
  }
}

export async function payInvoice(bolt11: string): Promise<{ fee_sats: number; payment_hash: string }> {
  const data = await lnFetchWithFallback(
    '/api/v1/payments',
    {
      method: 'POST',
      body: JSON.stringify({ out: true, bolt11 }),
    },
    ['admin', 'invoice']
  );

  return {
    fee_sats: Math.ceil(Math.abs(Number(data?.fee || 0)) / 1000),
    payment_hash: String(data?.payment_hash || ''),
  };
}

export async function getPayments(): Promise<LNPayment[]> {
  const data: any[] = await lnFetchWithFallback('/api/v1/payments', {}, ['admin', 'invoice']);
  return data.map((payment) => ({
    payment_hash: String(payment?.payment_hash || ''),
    amount_sats: Math.round(Number(payment?.amount || 0) / 1000),
    fee_sats: Math.ceil(Math.abs(Number(payment?.fee || 0)) / 1000),
    memo: payment?.extra?.memo ?? payment?.memo ?? '',
    pending: !payment?.paid,
    created_at: Number(payment?.time || 0),
  }));
}

export function decodeBolt11Amount(bolt11: string): number | null {
  try {
    const hrp = bolt11.match(/^lnbc(\d+)([munp]?)/i);
    if (!hrp) return null;

    const [, num, mult] = hrp;
    const multipliers: Record<string, number> = {
      m: 0.001,
      u: 0.000001,
      n: 0.000000001,
      p: 0.000000000001,
    };
    const btc = parseFloat(num) * (multipliers[mult] ?? 1);
    return Math.round(btc * 100_000_000);
  } catch {
    return null;
  }
}

export function formatSats(sats: number): string {
  if (sats >= 100_000_000) return `${(sats / 100_000_000).toFixed(8)} BTC`;
  return `${sats.toLocaleString()} sats`;
}

export function satsToFiat(sats: number, btcPriceUsd: number): number {
  return (sats / 100_000_000) * btcPriceUsd;
}
