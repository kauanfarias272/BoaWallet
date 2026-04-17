import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  X,
  AtSign,
  Receipt,
  Settings,
  Save,
} from 'lucide-react';
import { supabase } from '../supabase';
import {
  createInvoice,
  checkInvoicePaid,
  payInvoice,
  getPayments,
  decodeBolt11Amount,
  formatSats,
  satsToFiat,
  LNInvoice,
  LNPayment,
} from '../lib/lightning';
import {
  WalletSnapshot,
  computeExternalInvoiceFee,
  computeUserTransferFee,
  getWalletSnapshot,
  sendBalanceByUsername,
} from '../lib/platformPayments';
import { useAppContext } from '../AppContext';
import { FoundBoaUser, searchBoaUsers, searchCachedBoaUsers } from '../lib/userSearch';

interface Props {
  userId: string;
  userHandle?: string;
  btcPriceUsd?: number;
}

type View = 'home' | 'receive' | 'send';
type SendMode = 'invoice' | 'username';

function useWalletTx() {
  const { language } = useAppContext();
  return useCallback(
    (pt: string, en: string, es: string, it: string) => ({ pt, en, es, it }[language] ?? en),
    [language]
  );
}

function estimateInvoiceNetworkReserve(amountSats: number) {
  return Math.max(25, Math.ceil(Math.max(0, amountSats) * 0.02));
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

function ReceiveView({
  userId,
  btcPriceUsd,
  onBack,
  onPaid,
}: {
  userId: string;
  btcPriceUsd?: number;
  onBack: () => void;
  onPaid: (sats: number) => void;
}) {
  const tx = useWalletTx();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [invoice, setInvoice] = useState<LNInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const { copied, copy } = useCopy();

  const generate = async () => {
    const sats = parseInt(amount, 10);
    if (!sats || sats < 1) {
      setError(tx('Digite um valor valido em sats.', 'Enter a valid sats amount.', 'Ingresa un valor valido en sats.', 'Inserisci un valore valido in sats.'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const invoiceData = await createInvoice(sats, memo || 'BoaWallet');
      await supabase.from('lightning_invoices').insert({
        user_id: userId,
        payment_hash: invoiceData.payment_hash,
        bolt11: invoiceData.bolt11,
        amount_sats: invoiceData.amount_sats,
        memo: invoiceData.memo,
        status: 'pending',
      });
      setInvoice(invoiceData);
      setPolling(true);
    } catch (rawError: any) {
      setError(rawError?.message ?? tx('Nao foi possivel gerar a fatura.', 'Could not create the invoice.', 'No se pudo generar la factura.', 'Non e stato possibile generare la fattura.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!polling || !invoice) return;

    const interval = setInterval(async () => {
      const paid = await checkInvoicePaid(invoice.payment_hash);
      if (!paid) return;

      clearInterval(interval);
      setPolling(false);

      await Promise.all([
        supabase
          .from('lightning_invoices')
          .update({ status: 'paid', settled_at: new Date().toISOString() })
          .eq('payment_hash', invoice.payment_hash),
        supabase.rpc('upsert_lightning_balance', {
          p_user_id: userId,
          p_delta: invoice.amount_sats,
        }),
      ]);

      onPaid(invoice.amount_sats);
    }, 3000);

    return () => clearInterval(interval);
  }, [polling, invoice, userId, onPaid]);

  const fiatValue = btcPriceUsd && invoice
    ? satsToFiat(invoice.amount_sats, btcPriceUsd).toFixed(2)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[#1a1a1a] border border-gray-800 flex items-center justify-center">
          <X size={16} className="text-gray-400" />
        </button>
        <h2 className="font-bold text-white">
          {tx('Receber Bitcoin', 'Receive Bitcoin', 'Recibir Bitcoin', 'Ricevi Bitcoin')}
        </h2>
      </div>

      {!invoice ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              {tx('Valor (sats)', 'Amount (sats)', 'Monto (sats)', 'Importo (sats)')}
            </label>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
              type="text"
              inputMode="numeric"
              placeholder={tx('Ex: 1000', 'Ex: 1000', 'Ej: 1000', 'Es: 1000')}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-[#d0d0a0]/50"
            />
            {btcPriceUsd && amount && (
              <p className="text-xs text-gray-500 mt-1">
                ~ ${satsToFiat(parseInt(amount, 10) || 0, btcPriceUsd).toFixed(2)} USD
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              {tx('Descricao (opcional)', 'Description (optional)', 'Descripcion (opcional)', 'Descrizione (opzionale)')}
            </label>
            <input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder={tx(
                'Ex: recarga da carteira, divisao de conta...',
                'Ex: wallet top-up, bill split...',
                'Ej: recarga de cartera, division de cuenta...',
                'Es: ricarica wallet, divisione conto...'
              )}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d0d0a0]/50"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || !amount}
            className="w-full py-3.5 bg-[#d0d0a0] text-[#0a0a0a] font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading
              ? tx('Gerando...', 'Generating...', 'Generando...', 'Generazione...')
              : tx('Gerar fatura', 'Generate invoice', 'Generar factura', 'Genera fattura')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl flex items-center justify-center">
            <QRCode value={invoice.bolt11.toUpperCase()} size={220} />
          </div>

          <div className="text-center">
            <p className="text-2xl font-bold text-[#d0d0a0]">{formatSats(invoice.amount_sats)}</p>
            {fiatValue && <p className="text-gray-500 text-sm">~ ${fiatValue} USD</p>}
            {invoice.memo && <p className="text-gray-400 text-sm mt-1">{invoice.memo}</p>}
          </div>

          <div className="flex items-center justify-center gap-2 py-2">
            {polling ? (
              <>
                <RefreshCw size={14} className="text-amber-400 animate-spin" />
                <span className="text-amber-400 text-sm">
                  {tx('Aguardando pagamento...', 'Waiting for payment...', 'Esperando pago...', 'In attesa del pagamento...')}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-emerald-400 text-sm font-semibold">
                  {tx('Pago!', 'Paid!', 'Pagado!', 'Pagato!')}
                </span>
              </>
            )}
          </div>

          <button
            onClick={() => copy(invoice.bolt11)}
            className="w-full py-3 bg-[#1a1a1a] border border-gray-700 rounded-xl text-sm flex items-center justify-center gap-2 text-gray-300 hover:border-gray-500 transition-colors"
          >
            {copied ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Copy size={15} />}
            {copied
              ? tx('Copiado!', 'Copied!', 'Copiado!', 'Copiato!')
              : tx('Copiar fatura (bolt11)', 'Copy invoice (bolt11)', 'Copiar factura (bolt11)', 'Copia fattura (bolt11)')}
          </button>

          <button
            onClick={() => {
              setInvoice(null);
              setAmount('');
              setMemo('');
              setPolling(false);
            }}
            className="w-full py-2 text-gray-600 text-sm hover:text-gray-400 transition-colors"
          >
            {tx('Gerar nova fatura', 'Generate another invoice', 'Generar otra factura', 'Genera un altra fattura')}
          </button>
        </div>
      )}
    </div>
  );
}

function SendView({
  userId,
  walletSnapshot,
  userHandle,
  btcPriceUsd,
  onBack,
  onRefreshBalance,
  onSent,
}: {
  userId: string;
  walletSnapshot: WalletSnapshot | null;
  userHandle?: string;
  btcPriceUsd?: number;
  onBack: () => void;
  onRefreshBalance: () => Promise<void>;
  onSent: (message: string) => void;
}) {
  const tx = useWalletTx();
  const [mode, setMode] = useState<SendMode>('invoice');
  const [bolt11, setBolt11] = useState('');
  const [decoded, setDecoded] = useState<number | null>(null);
  const [recipient, setRecipient] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<FoundBoaUser | null>(null);
  const [userResults, setUserResults] = useState<FoundBoaUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableBalance = walletSnapshot?.availableSats ?? 0;
  const transferAmount = parseInt(amount, 10) || 0;
  const internalTransferFee = computeUserTransferFee(transferAmount);
  const internalTransferTotal = transferAmount + internalTransferFee;

  const invoiceAmount = decoded || 0;
  const invoicePlatformFee = computeExternalInvoiceFee(invoiceAmount);
  const invoiceNetworkReserve = estimateInvoiceNetworkReserve(invoiceAmount);
  const invoiceEstimatedTotal = invoiceAmount + invoicePlatformFee + invoiceNetworkReserve;

  const cleanRecipientQuery = recipient.replace('@', '').trim();
  const showUserSuggestions = mode === 'username' && (recipient.trim().startsWith('@') || cleanRecipientQuery.length > 0);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!showUserSuggestions) {
      setUserResults([]);
      setSearchingUsers(false);
      return;
    }

    const instantResults = searchCachedBoaUsers(cleanRecipientQuery, userId, 8);
    setUserResults(instantResults);

    if (!cleanRecipientQuery) {
      setSearchingUsers(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingUsers(instantResults.length === 0);
      try {
        const results = await searchBoaUsers(cleanRecipientQuery, userId, 8);
        setUserResults(results);
      } catch {
        setUserResults([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 140);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [cleanRecipientQuery, showUserSuggestions, userId]);

  const handleBolt11 = (value: string) => {
    setBolt11(value);
    setDecoded(decodeBolt11Amount(value.trim()));
    setError('');
  };

  const handleSelectRecipient = (user: FoundBoaUser) => {
    setSelectedRecipient(user);
    setRecipient(`@${user.username}`);
    setUserResults([]);
    setError('');
  };

  const handleRecipientInput = (value: string) => {
    setRecipient(value);
    setSelectedRecipient(null);
    setError('');
  };

  const sendInvoice = async () => {
    const trimmed = bolt11.trim();
    if (!trimmed.toLowerCase().startsWith('lnbc')) {
      setError(tx('Fatura invalida. Deve comecar com "lnbc".', 'Invalid invoice. It must start with "lnbc".', 'Factura invalida. Debe empezar con "lnbc".', 'Fattura non valida. Deve iniziare con "lnbc".'));
      return;
    }

    const sats = decoded;
    if (!sats || sats < 1) {
      setError(tx('Nao foi possivel ler o valor da fatura.', 'Could not read the invoice amount.', 'No se pudo leer el valor de la factura.', 'Non e stato possibile leggere l importo della fattura.'));
      return;
    }

    if (invoiceEstimatedTotal > availableBalance) {
      setError(
        tx(
          `Saldo disponivel insuficiente. Necessario pelo menos ${invoiceEstimatedTotal.toLocaleString()} sats.`,
          `Available balance is too low. At least ${invoiceEstimatedTotal.toLocaleString()} sats are required.`,
          `Saldo disponible insuficiente. Se necesitan al menos ${invoiceEstimatedTotal.toLocaleString()} sats.`,
          `Saldo disponibile insufficiente. Servono almeno ${invoiceEstimatedTotal.toLocaleString()} sats.`
        )
      );
      return;
    }

    setLoading(true);
    setError('');

    const platformFeeSats = computeExternalInvoiceFee(sats);
    const reserveSats = estimateInvoiceNetworkReserve(sats);
    const provisionalDebitSats = sats + platformFeeSats + reserveSats;
    let provisionalDebited = false;
    let invoicePaid = false;

    try {
      await supabase.rpc('upsert_lightning_balance', {
        p_user_id: userId,
        p_delta: -provisionalDebitSats,
      });
      provisionalDebited = true;

      const { fee_sats, payment_hash } = await payInvoice(trimmed);
      invoicePaid = true;

      const actualTotal = sats + platformFeeSats + fee_sats;
      const adjustment = provisionalDebitSats - actualTotal;

      if (adjustment > 0) {
        await supabase.rpc('upsert_lightning_balance', {
          p_user_id: userId,
          p_delta: adjustment,
        });
      } else if (adjustment < 0) {
        await supabase.rpc('upsert_lightning_balance', {
          p_user_id: userId,
          p_delta: adjustment,
        });
      }

      try {
        await supabase.from('lightning_payments').insert({
          user_id: userId,
          payment_hash,
          bolt11: trimmed,
          amount_sats: sats,
          fee_sats: platformFeeSats + fee_sats,
          memo: tx('Pagamento externo', 'External payment', 'Pago externo', 'Pagamento esterno'),
          status: 'paid',
          settled_at: new Date().toISOString(),
        });
      } catch (historyError) {
        console.error('[BoaWallet] Failed to persist external payment history', historyError);
      }

      await onRefreshBalance();
      onSent(
        tx(
          `${formatSats(sats)} enviado. Taxa Boa: ${platformFeeSats} sats. Taxa da rede: ${fee_sats} sats.`,
          `${formatSats(sats)} sent. Boa fee: ${platformFeeSats} sats. Network fee: ${fee_sats} sats.`,
          `${formatSats(sats)} enviado. Tarifa Boa: ${platformFeeSats} sats. Tarifa de red: ${fee_sats} sats.`,
          `${formatSats(sats)} inviati. Commissione Boa: ${platformFeeSats} sats. Commissione rete: ${fee_sats} sats.`
        )
      );
    } catch (rawError: any) {
      if (provisionalDebited && !invoicePaid) {
        try {
          await supabase.rpc('upsert_lightning_balance', {
            p_user_id: userId,
            p_delta: provisionalDebitSats,
          });
        } catch {
          // ignore refund failure here; the original LNbits error is more important
        }
      }

      setError(
        rawError?.message ?? tx('Pagamento externo falhou.', 'External payment failed.', 'El pago externo fallo.', 'Il pagamento esterno non e riuscito.')
      );
    } finally {
      setLoading(false);
    }
  };

  const sendToUsername = async () => {
    if (!recipient.trim()) {
      setError(tx('Informe o @username de destino.', 'Enter the recipient @username.', 'Ingresa el @usuario de destino.', 'Inserisci l @username di destinazione.'));
      return;
    }

    if (!transferAmount || transferAmount < 1) {
      setError(tx('Informe um valor valido em sats.', 'Enter a valid sats amount.', 'Ingresa un valor valido en sats.', 'Inserisci un valore valido in sats.'));
      return;
    }

    if (internalTransferTotal > availableBalance) {
      setError(
        tx(
          `Saldo disponivel insuficiente. Necessario: ${internalTransferTotal.toLocaleString()} sats.`,
          `Available balance too low. Required: ${internalTransferTotal.toLocaleString()} sats.`,
          `Saldo disponible insuficiente. Necesario: ${internalTransferTotal.toLocaleString()} sats.`,
          `Saldo disponibile insufficiente. Necessari: ${internalTransferTotal.toLocaleString()} sats.`
        )
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await sendBalanceByUsername({
        senderId: userId,
        recipientUsername: recipient,
        amountSats: transferAmount,
      });

      await onRefreshBalance();
      onSent(
        result.deliveredInstantly
          ? tx(
              `${transferAmount.toLocaleString()} sats enviados para ${recipient.startsWith('@') ? recipient : '@' + recipient}. Taxa Boa: ${result.feeSats} sats.`,
              `${transferAmount.toLocaleString()} sats sent to ${recipient.startsWith('@') ? recipient : '@' + recipient}. Boa fee: ${result.feeSats} sats.`,
              `${transferAmount.toLocaleString()} sats enviados a ${recipient.startsWith('@') ? recipient : '@' + recipient}. Tarifa Boa: ${result.feeSats} sats.`,
              `${transferAmount.toLocaleString()} sats inviati a ${recipient.startsWith('@') ? recipient : '@' + recipient}. Commissione Boa: ${result.feeSats} sats.`
            )
          : tx(
              `${transferAmount.toLocaleString()} sats reservados para ${recipient.startsWith('@') ? recipient : '@' + recipient}. Taxa Boa: ${result.feeSats} sats.`,
              `${transferAmount.toLocaleString()} sats reserved for ${recipient.startsWith('@') ? recipient : '@' + recipient}. Boa fee: ${result.feeSats} sats.`,
              `${transferAmount.toLocaleString()} sats reservados para ${recipient.startsWith('@') ? recipient : '@' + recipient}. Tarifa Boa: ${result.feeSats} sats.`,
              `${transferAmount.toLocaleString()} sats riservati per ${recipient.startsWith('@') ? recipient : '@' + recipient}. Commissione Boa: ${result.feeSats} sats.`
            )
      );
      setRecipient('');
      setSelectedRecipient(null);
      setAmount('');
      setUserResults([]);
    } catch (rawError: any) {
      setError(rawError?.message ?? tx('Nao foi possivel enviar agora.', 'Could not send right now.', 'No se pudo enviar ahora.', 'Impossibile inviare ora.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[#1a1a1a] border border-gray-800 flex items-center justify-center">
          <X size={16} className="text-gray-400" />
        </button>
        <h2 className="font-bold text-white">
          {tx('Enviar Bitcoin', 'Send Bitcoin', 'Enviar Bitcoin', 'Invia Bitcoin')}
        </h2>
      </div>

      <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-1 flex gap-1">
        <button
          onClick={() => setMode('invoice')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${mode === 'invoice' ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
        >
          <span className="inline-flex items-center gap-2">
            <Receipt size={14} />
            {tx('Fatura externa', 'External invoice', 'Factura externa', 'Fattura esterna')}
          </span>
        </button>
        <button
          onClick={() => setMode('username')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${mode === 'username' ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
        >
          <span className="inline-flex items-center gap-2">
            <AtSign size={14} />
            {tx('Por username', 'By username', 'Por usuario', 'Per username')}
          </span>
        </button>
      </div>

      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {tx('Saldo disponivel', 'Available balance', 'Saldo disponible', 'Saldo disponibile')}
        </span>
        <span className="text-[#d0d0a0] font-bold">{formatSats(availableBalance)}</span>
      </div>

      {mode === 'invoice' ? (
        <>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              {tx('Fatura Lightning (bolt11)', 'Lightning invoice (bolt11)', 'Factura Lightning (bolt11)', 'Fattura Lightning (bolt11)')}
            </label>
            <textarea
              value={bolt11}
              onChange={(event) => handleBolt11(event.target.value)}
              placeholder="lnbc..."
              rows={4}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-[#d0d0a0]/50 resize-none"
            />
          </div>

          {decoded !== null && decoded > 0 && (
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{tx('Valor da fatura', 'Invoice amount', 'Valor de la factura', 'Importo fattura')}</span>
                <span className="text-white font-semibold">{decoded.toLocaleString()} sats</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{tx('Taxa Boa (2%)', 'Boa fee (2%)', 'Tarifa Boa (2%)', 'Commissione Boa (2%)')}</span>
                <span className="text-orange-300">{invoicePlatformFee.toLocaleString()} sats</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{tx('Reserva de rede', 'Network reserve', 'Reserva de red', 'Riserva rete')}</span>
                <span className="text-amber-300">{invoiceNetworkReserve.toLocaleString()} sats</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-semibold">{tx('Total previsto', 'Estimated total', 'Total previsto', 'Totale previsto')}</span>
                <span className="text-[#d0d0a0] font-bold">{invoiceEstimatedTotal.toLocaleString()} sats</span>
              </div>
              {btcPriceUsd && (
                <p className="text-[11px] text-gray-500">
                  ~ ${satsToFiat(decoded, btcPriceUsd).toFixed(2)} USD
                </p>
              )}
              <p className="text-[11px] text-gray-500">
                {tx(
                  'A taxa real da rede e calculada no pagamento. A reserva e devolvida se sobrar saldo.',
                  'The real network fee is calculated during payment. Any unused reserve is returned.',
                  'La tarifa real de red se calcula en el pago. La reserva sobrante se devuelve.',
                  'La commissione reale di rete viene calcolata al pagamento. L eventuale riserva inutilizzata viene restituita.'
                )}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={sendInvoice}
            disabled={loading || !bolt11.trim()}
            className="w-full py-3.5 bg-[#d0d0a0] text-[#0a0a0a] font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUpRight size={16} />}
            {loading
              ? tx('Enviando...', 'Sending...', 'Enviando...', 'Invio...')
              : tx('Pagar fatura externa', 'Pay external invoice', 'Pagar factura externa', 'Paga fattura esterna')}
          </button>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              {tx('Usuario de destino', 'Recipient username', 'Usuario de destino', 'Username di destinazione')}
            </label>
            <input
              value={recipient}
              onChange={(event) => handleRecipientInput(event.target.value)}
              placeholder={userHandle ? tx('Ex: @felipe', 'Ex: @felipe', 'Ej: @felipe', 'Es: @felipe') : tx('Ex: @kauan', 'Ex: @kauan', 'Ej: @kauan', 'Es: @kauan')}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d0d0a0]/50"
            />

            {showUserSuggestions && (
              <div className="mt-2 bg-[#1a1a1a] border border-gray-800 rounded-2xl overflow-hidden">
                {userResults.length > 0 ? (
                  userResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectRecipient(user)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-b-0 text-left hover:bg-[#202020]"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#111] border border-gray-700 flex items-center justify-center text-[#d0d0a0] font-bold shrink-0">
                        {(user.name || user.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-semibold truncate">{user.name || user.username}</p>
                        <p className="text-xs text-gray-500 truncate">@{user.username}</p>
                      </div>
                    </button>
                  ))
                ) : !searchingUsers && cleanRecipientQuery ? (
                  <div className="px-4 py-3 text-xs text-red-400">
                    {tx('Nenhum usuario encontrado.', 'No users found.', 'No se encontro ningun usuario.', 'Nessun utente trovato.')}
                  </div>
                ) : null}

                {searchingUsers && (
                  <div className="px-4 py-3 text-xs text-gray-500 flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin" />
                    <span>{tx('Buscando usuarios...', 'Searching users...', 'Buscando usuarios...', 'Ricerca utenti...')}</span>
                  </div>
                )}
              </div>
            )}

            {selectedRecipient && (
              <div className="mt-2 rounded-xl border border-emerald-800/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
                {tx('Destino selecionado:', 'Selected recipient:', 'Destino seleccionado:', 'Destinatario selezionato:')} @{selectedRecipient.username}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              {tx('Valor (sats)', 'Amount (sats)', 'Monto (sats)', 'Importo (sats)')}
            </label>
            <input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value.replace(/\D/g, ''));
                setError('');
              }}
              inputMode="numeric"
              placeholder={tx('Ex: 500', 'Ex: 500', 'Ej: 500', 'Es: 500')}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d0d0a0]/50"
            />
          </div>

          {transferAmount > 0 && (
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{tx('Valor enviado', 'Amount sent', 'Valor enviado', 'Importo inviato')}</span>
                <span className="text-white font-semibold">{transferAmount.toLocaleString()} sats</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{tx('Taxa Boa interna (1%)', 'Internal Boa fee (1%)', 'Tarifa Boa interna (1%)', 'Commissione Boa interna (1%)')}</span>
                <span className="text-orange-300">{internalTransferFee.toLocaleString()} sats</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-semibold">{tx('Total debitado', 'Total debited', 'Total debitado', 'Totale addebitato')}</span>
                <span className="text-[#d0d0a0] font-bold">{internalTransferTotal.toLocaleString()} sats</span>
              </div>
              <p className="text-[11px] text-gray-500">
                {tx(
                  'Se o @username ainda nao tiver carteira ativa, o valor fica reservado na plataforma ate o suporte concluir o resgate.',
                  'If the @username does not have an active wallet yet, the amount stays reserved until support completes the claim.',
                  'Si el @usuario aun no tiene cartera activa, el monto queda reservado hasta que soporte complete el rescate.',
                  'Se l @username non ha ancora un wallet attivo, l importo resta riservato finche il supporto non completa il riscatto.'
                )}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={sendToUsername}
            disabled={loading || !recipient.trim() || !amount}
            className="w-full py-3.5 bg-[#d0d0a0] text-[#0a0a0a] font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <AtSign size={16} />}
            {loading
              ? tx('Enviando...', 'Sending...', 'Enviando...', 'Invio...')
              : tx('Enviar por username', 'Send by username', 'Enviar por usuario', 'Invia per username')}
          </button>
        </>
      )}
    </div>
  );
}

const readLsKey = (key: string) => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};

export function LightningWallet({ userId, userHandle, btcPriceUsd }: Props) {
  const tx = useWalletTx();
  const [view, setView] = useState<View>('home');
  const [walletSnapshot, setWalletSnapshot] = useState<WalletSnapshot | null>(null);
  const [payments, setPayments] = useState<LNPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [cfgBase, setCfgBase] = useState(() => readLsKey('boawallet_lnbits_base'));
  const [cfgInvoice, setCfgInvoice] = useState(() => readLsKey('boawallet_lnbits_invoice_key'));
  const [cfgAdmin, setCfgAdmin] = useState(() => readLsKey('boawallet_lnbits_admin_key'));

  const saveConfig = () => {
    try {
      if (cfgBase.trim()) localStorage.setItem('boawallet_lnbits_base', cfgBase.trim());
      else localStorage.removeItem('boawallet_lnbits_base');
      if (cfgInvoice.trim()) localStorage.setItem('boawallet_lnbits_invoice_key', cfgInvoice.trim());
      else localStorage.removeItem('boawallet_lnbits_invoice_key');
      if (cfgAdmin.trim()) localStorage.setItem('boawallet_lnbits_admin_key', cfgAdmin.trim());
      else localStorage.removeItem('boawallet_lnbits_admin_key');
    } catch { /* ignore storage errors */ }
    setShowConfig(false);
    void loadHistory();
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  };

  const loadWallet = useCallback(async () => {
    setWalletSnapshot(await getWalletSnapshot(userId));
  }, [userId]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setNetworkError('');
    try {
      await loadWallet();
      const history = await getPayments();
      setPayments(history.slice(0, 30));
    } catch (rawError: any) {
      setPayments([]);
      setNetworkError(
        rawError?.message || tx('Nao foi possivel carregar a rede Lightning agora.', 'Could not load the Lightning network right now.', 'No se pudo cargar la red Lightning ahora.', 'Non e stato possibile caricare la rete Lightning ora.')
      );
    } finally {
      setLoading(false);
    }
  }, [loadWallet, tx]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const onPaid = async (sats: number) => {
    await loadWallet();
    showToast(
      tx(
        `+${formatSats(sats)} recebido!`,
        `+${formatSats(sats)} received!`,
        `+${formatSats(sats)} recibido!`,
        `+${formatSats(sats)} ricevuti!`
      )
    );
    setView('home');
  };

  const onSent = (message: string) => {
    showToast(message);
    setView('home');
  };

  const fiatBalance = btcPriceUsd && walletSnapshot
    ? satsToFiat(walletSnapshot.balanceSats, btcPriceUsd)
    : null;

  const hasNetworkActivity = useMemo(() => payments.length > 0, [payments]);

  if (view === 'receive') {
    return <ReceiveView userId={userId} btcPriceUsd={btcPriceUsd} onBack={() => setView('home')} onPaid={onPaid} />;
  }

  if (view === 'send') {
    return (
      <SendView
        userId={userId}
        userHandle={userHandle}
        walletSnapshot={walletSnapshot}
        btcPriceUsd={btcPriceUsd}
        onBack={() => setView('home')}
        onRefreshBalance={loadWallet}
        onSent={onSent}
      />
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-900 border border-emerald-700 text-emerald-300 text-sm px-5 py-3 rounded-2xl shadow-xl">
          {toast}
        </div>
      )}

      <div className="bg-gradient-to-br from-[#1a1a0a] to-[#0f0f08] border border-[#d0d0a0]/20 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#d0d0a0]">
            <Zap size={18} />
            <span className="text-sm font-semibold">
              {tx('Carteira Lightning', 'Lightning Wallet', 'Cartera Lightning', 'Wallet Lightning')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig((v) => !v)}
              title={tx('Configurar LNbits', 'Configure LNbits', 'Configurar LNbits', 'Configura LNbits')}
              className="text-gray-600 hover:text-[#d0d0a0] transition-colors"
            >
              <Settings size={15} />
            </button>
            <button onClick={() => void loadHistory()} className="text-gray-600 hover:text-gray-400 transition-colors">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {showConfig && (
          <div className="rounded-2xl border border-[#5A5A40]/40 bg-[#0f0f08] p-4 space-y-3">
            <p className="text-xs font-semibold text-[#d0d0a0] uppercase tracking-wider">
              {tx('Configurar LNbits', 'Configure LNbits', 'Configurar LNbits', 'Configura LNbits')}
            </p>
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Base URL</label>
                <input
                  value={cfgBase}
                  onChange={(e) => setCfgBase(e.target.value)}
                  placeholder="https://your-instance.lnbits.com"
                  className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[#d0d0a0]/50"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Invoice Key (read-only)</label>
                <input
                  value={cfgInvoice}
                  onChange={(e) => setCfgInvoice(e.target.value)}
                  placeholder="invoice-only API key"
                  className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[#d0d0a0]/50"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Admin Key</label>
                <input
                  value={cfgAdmin}
                  onChange={(e) => setCfgAdmin(e.target.value)}
                  placeholder="admin API key"
                  className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[#d0d0a0]/50"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveConfig}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] text-xs font-semibold"
              >
                <Save size={13} />
                {tx('Salvar', 'Save', 'Guardar', 'Salva')}
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 rounded-xl bg-[#1a1a1a] border border-gray-800 text-gray-500 text-xs"
              >
                {tx('Cancelar', 'Cancel', 'Cancelar', 'Annulla')}
              </button>
            </div>
            <p className="text-[10px] text-gray-600">
              {tx(
                'As chaves ficam salvas no dispositivo. Deixe em branco para usar o padrão.',
                'Keys are saved on this device. Leave blank to use the default.',
                'Las claves se guardan en el dispositivo. Dejar en blanco para usar el valor predeterminado.',
                'Le chiavi vengono salvate sul dispositivo. Lascia vuoto per usare il valore predefinito.'
              )}
            </p>
          </div>
        )}

        <div>
          <p className="text-4xl font-black text-white tracking-tight">{formatSats(walletSnapshot?.balanceSats ?? 0)}</p>
          {fiatBalance !== null && (
            <p className="text-gray-500 text-sm mt-1">~ ${fiatBalance.toFixed(2)} USD</p>
          )}
          {userHandle && (
            <p className="mt-2 text-xs text-[#d0d0a0]">
              {tx('Seu @username:', 'Your @username:', 'Tu @usuario:', 'Il tuo @username:')} @{userHandle}
            </p>
          )}
        </div>

        {walletSnapshot && (
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label={tx('Disponivel', 'Available', 'Disponible', 'Disponibile')}
              value={formatSats(walletSnapshot.availableSats)}
            />
            <MiniStat
              label={tx('Reservado em garantia', 'Reserved as guarantee', 'Reservado en garantia', 'Riservato in garanzia')}
              value={formatSats(walletSnapshot.reservedSats)}
              accent="warning"
            />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => setView('receive')}
            className="flex-1 py-3 bg-[#d0d0a0] text-[#0a0a0a] rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <ArrowDownLeft size={16} />
            {tx('Receber', 'Receive', 'Recibir', 'Ricevi')}
          </button>
          <button
            onClick={() => setView('send')}
            className="flex-1 py-3 bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <ArrowUpRight size={16} />
            {tx('Enviar', 'Send', 'Enviar', 'Invia')}
          </button>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {tx('Como funciona agora', 'How it works now', 'Como funciona ahora', 'Come funziona ora')}
        </p>
        <ul className="space-y-1.5 text-xs text-gray-500">
          <li className="flex items-start gap-2">
            <span className="text-[#d0d0a0] shrink-0">•</span>
            {tx('Recarregue a carteira com invoice Lightning.', 'Top up the wallet with a Lightning invoice.', 'Recarga la cartera con invoice Lightning.', 'Ricarica il wallet con una fattura Lightning.')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#d0d0a0] shrink-0">•</span>
            {tx('Envios para @username dentro da Boa cobram 1%.', 'Transfers to @username inside Boa charge 1%.', 'Los envios a @usuario dentro de Boa cobran 1%.', 'I trasferimenti a @username dentro Boa costano l 1%.')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#d0d0a0] shrink-0">•</span>
            {tx('Pagamentos por fatura externa cobram 2% da Boa mais a taxa real da rede.', 'External invoice payments charge Boa 2% plus the real network fee.', 'Los pagos por factura externa cobran 2% de Boa mas la tarifa real de red.', 'I pagamenti con fattura esterna addebitano il 2% di Boa piu la commissione reale di rete.')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#d0d0a0] shrink-0">•</span>
            {tx('O saldo reservado em garantia fica bloqueado para proteger as assinaturas mensais.', 'Reserved guarantee balance stays locked to protect monthly subscriptions.', 'El saldo reservado en garantia queda bloqueado para proteger las suscripciones mensuales.', 'Il saldo riservato in garanzia resta bloccato per proteggere gli abbonamenti mensili.')}
          </li>
        </ul>
      </div>

      {networkError && (
        <div className="rounded-2xl border border-red-900/30 bg-red-900/10 px-4 py-3 text-sm text-red-300">
          {networkError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-gray-600">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">
            {tx('Carregando...', 'Loading...', 'Cargando...', 'Caricamento...')}
          </span>
        </div>
      ) : hasNetworkActivity ? (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {tx('Atividade recente da rede', 'Recent network activity', 'Actividad reciente de la red', 'Attivita recente della rete')}
          </p>
          <div className="space-y-2">
            {payments.map((payment) => {
              const incoming = payment.amount_sats > 0;
              return (
                <div key={payment.payment_hash} className="bg-[#1a1a1a] border border-gray-800 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${incoming ? 'text-emerald-300' : 'text-orange-300'}`}>
                      {incoming ? '+' : ''}{formatSats(payment.amount_sats)}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {payment.memo || tx('Transacao Lightning', 'Lightning transaction', 'Transaccion Lightning', 'Transazione Lightning')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400">
                      {new Date(payment.created_at * 1000).toLocaleString()}
                    </p>
                    {!incoming && (
                      <p className="text-[11px] text-gray-500">
                        {tx('taxa:', 'fee:', 'tarifa:', 'commissione:')} {payment.fee_sats} sats
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-800 bg-[#1a1a1a] px-4 py-6 text-center text-sm text-gray-500">
          {tx('Nenhuma atividade Lightning ainda.', 'No Lightning activity yet.', 'Todavia no hay actividad Lightning.', 'Nessuna attivita Lightning ancora.')}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: 'warning' }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${accent === 'warning' ? 'border-orange-900/30 bg-orange-900/10' : 'border-gray-800 bg-[#151515]'}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-bold ${accent === 'warning' ? 'text-orange-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}
