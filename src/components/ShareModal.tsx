import React, { useEffect, useRef, useState } from 'react';
import { Subscription, Currency } from '../types';
import { supabase } from '../supabase';
import { Users, X, Check, Search, Zap, Clock } from 'lucide-react';
import { FoundBoaUser, searchBoaUsers, searchCachedBoaUsers } from '../lib/userSearch';
import { getPlatformJoinPreview } from '../lib/platformPayments';
import { withTimeout } from '../lib/requestTimeout';

interface FoundUser extends FoundBoaUser {}

type PaymentMode = 'immediate' | 'bitcoin';
type PaymentType = 'onetime' | 'monthly';

interface ShareModalProps {
  subscription: Subscription;
  currentUserId: string;
  onClose: () => void;
  onShared: (msg: string) => void;
  onShareLinkedMember?: (
    subscriptionId: string,
    user: FoundUser,
    amount: number,
    currency: Currency,
    options: {
      shareCredentials: boolean;
      paymentMode: PaymentMode;
      paymentType: PaymentType;
      bitcoinAmountSats: number;
    }
  ) => Promise<void>;
  preselectedUser?: FoundUser | null;
}

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR', 'GBP', 'ARS'];

export function ShareModal({
  subscription,
  currentUserId,
  onClose,
  onShared,
  onShareLinkedMember,
  preselectedUser,
}: ShareModalProps) {
  const [query, setQuery] = useState(preselectedUser ? '@' + preselectedUser.username : '');
  const [results, setResults] = useState<FoundUser[]>([]);
  const [selected, setSelected] = useState<FoundUser | null>(preselectedUser ?? null);
  const [amount, setAmount] = useState(subscription.costAmount.toString());
  const [currency, setCurrency] = useState<Currency>(subscription.costCurrency);
  const [shareCredentials, setShareCredentials] = useState(!!(subscription.serviceUsername || subscription.servicePassword));
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('immediate');
  const [paymentType, setPaymentType] = useState<PaymentType>('onetime');
  const [bitcoinSats, setBitcoinSats] = useState('');

  const satsNum = parseInt(bitcoinSats, 10) || 0;
  const preview = getPlatformJoinPreview(satsNum, paymentType);
  const hasCredentials = !!(subscription.serviceUsername || subscription.servicePassword);

  useEffect(() => {
    const q = query.replace('@', '').trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (selected) {
      setResults([]);
      setLoading(false);
      return;
    }

    const instantResults = searchCachedBoaUsers(q, currentUserId, 6);
    if (query.trim().startsWith('@') || q) {
      setResults(instantResults);
    } else {
      setResults([]);
    }

    if (!q) {
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchBoaUsers(q, currentUserId, 6));
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 140);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected, currentUserId]);

  const selectUser = (user: FoundUser) => {
    setSelected(user);
    setQuery('@' + user.username);
    setResults([]);
    setError('');
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery('');
    setResults([]);
    setError('');
  };

  const handleShare = async () => {
    if (!selected) {
      setError('Selecione um usuario');
      return;
    }

    if (paymentMode === 'bitcoin' && satsNum <= 0) {
      setError('Informe o valor em sats');
      return;
    }

    setSharing(true);
    setError('');

    try {
      const { error: shareError } = await withTimeout(
        supabase.from('subscription_members').upsert({
          subscription_id: subscription.id,
          owner_id: currentUserId,
          member_id: selected.id,
          amount: parseFloat(amount) || 0,
          currency,
          accepted: false,
          payment_mode: paymentMode,
          payment_type: paymentMode === 'bitcoin' ? paymentType : 'onetime',
          bitcoin_amount_sats: paymentMode === 'bitcoin' ? preview.sellerAmountSats : 0,
          payment_status: 'unpaid',
          share_credentials: shareCredentials,
          credentials_unlocked: false,
          platform_fee_sats: paymentMode === 'bitcoin' ? preview.platformFeeSats : 0,
          guarantee_sats: paymentMode === 'bitcoin' ? preview.guaranteeSats : 0,
          public_join: false,
        }),
        5000,
        'Share request timed out'
      );

      if (shareError) {
        const isColumnError = shareError.code === '42703' || shareError.message?.toLowerCase().includes('column');

        if (!isColumnError) {
          setError('Erro: ' + shareError.message);
          return;
        }

        if (paymentMode === 'bitcoin') {
          setError('O banco ainda nao recebeu a migracao do marketplace. Execute o SQL novo para cobrar em Bitcoin.');
          return;
        }

        const { error: legacyShareError } = await withTimeout(
          supabase.from('subscription_members').upsert({
            subscription_id: subscription.id,
            owner_id: currentUserId,
            member_id: selected.id,
            amount: parseFloat(amount) || 0,
            currency,
            accepted: false,
          }),
          5000,
          'Legacy share request timed out'
        );

        if (legacyShareError) {
          setError('Erro: ' + legacyShareError.message);
          return;
        }
      }

      if (onShareLinkedMember) {
        await onShareLinkedMember(subscription.id, selected, parseFloat(amount) || 0, currency, {
          shareCredentials,
          paymentMode,
          paymentType,
          bitcoinAmountSats: paymentMode === 'bitcoin' ? preview.sellerAmountSats : 0,
        });
      }

      setDone(true);
      setTimeout(() => {
        onShared(`${subscription.emoji} ${subscription.name} compartilhado com @${selected.username}!`);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Erro ao compartilhar');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl w-full sm:max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2a2a1a] flex items-center justify-center">
              <Users size={20} className="text-[#d0d0a0]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Compartilhar assinatura</h3>
              <p className="text-xs text-gray-500">{subscription.emoji} {subscription.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {done ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-900/40 border border-emerald-700 flex items-center justify-center">
                <Check size={28} className="text-emerald-400" />
              </div>
              <p className="text-white font-semibold">Compartilhado!</p>
              <p className="text-gray-400 text-sm text-center">@{selected?.username} recebera o convite</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Usuario BoaWallet</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSelected(null);
                      setError('');
                    }}
                    placeholder="Buscar por @username..."
                    className="w-full bg-[#252525] border border-gray-700 rounded-xl pl-9 pr-8 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#d0d0a0]/50"
                  />
                  {query && (
                    <button onClick={clearSelection} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {results.length > 0 && !selected && (
                  <div className="mt-1 bg-[#252525] border border-gray-700 rounded-xl overflow-hidden">
                    {results.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => selectUser(user)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#303030] transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#d0d0a0] flex items-center justify-center text-[#0a0a0a] text-xs font-bold shrink-0">
                          {(user.name || user.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{user.name || user.username}</p>
                          <p className="text-gray-500 text-xs">@{user.username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {loading && !selected && (
                  <p className="text-xs text-gray-500 mt-1.5 px-1">Buscando...</p>
                )}

                {selected && (
                  <div className="mt-2 flex items-center gap-3 px-3 py-2.5 bg-emerald-900/20 border border-emerald-800/50 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-[#d0d0a0] flex items-center justify-center text-[#0a0a0a] text-xs font-bold shrink-0">
                      {(selected.name || selected.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{selected.name || selected.username}</p>
                      <p className="text-emerald-400 text-xs">@{selected.username}</p>
                    </div>
                    <button onClick={clearSelection} className="text-gray-500 hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {error && <p className="mt-1.5 text-red-400 text-xs">{error}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Valor da parte desse usuario</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    min="0"
                    step="0.01"
                    className="flex-1 bg-[#252525] border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d0d0a0]/50"
                  />
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value as Currency)}
                    className="bg-[#252525] border border-gray-700 rounded-xl px-3 py-3 text-white text-sm focus:outline-none"
                  >
                    {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Modo de entrada</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMode('immediate')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-sm font-medium transition-all ${
                      paymentMode === 'immediate'
                        ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300'
                        : 'bg-[#252525] border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <Check size={16} />
                    <span className="text-xs">Senha apos aceitacao</span>
                  </button>
                  <button
                    onClick={() => setPaymentMode('bitcoin')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-sm font-medium transition-all ${
                      paymentMode === 'bitcoin'
                        ? 'bg-orange-900/40 border-orange-700 text-orange-300'
                        : 'bg-[#252525] border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <Zap size={16} />
                    <span className="text-xs">Cobrar em saldo Bitcoin</span>
                  </button>
                </div>
              </div>

              {paymentMode === 'bitcoin' && (
                <div className="bg-[#1a1208] border border-orange-900/50 rounded-2xl p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">Tipo de entrada</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setPaymentType('onetime')}
                        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          paymentType === 'onetime'
                            ? 'bg-orange-900/50 border-orange-700 text-orange-300'
                            : 'bg-[#252525] border-gray-700 text-gray-500'
                        }`}
                      >
                        <Check size={12} /> Unica
                      </button>
                      <button
                        onClick={() => setPaymentType('monthly')}
                        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          paymentType === 'monthly'
                            ? 'bg-orange-900/50 border-orange-700 text-orange-300'
                            : 'bg-[#252525] border-gray-700 text-gray-500'
                        }`}
                      >
                        <Clock size={12} /> Mensal
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Valor da sua cota (sats)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 text-sm">âš¡</span>
                      <input
                        type="number"
                        value={bitcoinSats}
                        onChange={(event) => setBitcoinSats(event.target.value)}
                        placeholder="ex: 5000"
                        min="1"
                        className="w-full bg-[#252525] border border-orange-900/50 rounded-xl pl-8 pr-14 py-3 text-white text-sm focus:outline-none focus:border-orange-700/60 placeholder-gray-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">sats</span>
                    </div>
                  </div>

                  {satsNum > 0 && (
                    <div className="bg-[#252525] rounded-xl p-3 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Voce recebe</span>
                        <span className="text-white font-semibold">{preview.sellerAmountSats.toLocaleString()} sats</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Taxa plataforma (50%)</span>
                        <span className="text-orange-400">{preview.platformFeeSats.toLocaleString()} sats</span>
                      </div>
                      <div className="h-px bg-gray-700 my-1" />
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-300 font-semibold">Debito inicial</span>
                        <span className="text-orange-300 font-bold">âš¡ {preview.totalChargeSats.toLocaleString()} sats</span>
                      </div>
                      {paymentType === 'monthly' && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Garantia bloqueada</span>
                            <span className="text-amber-300">{preview.guaranteeSats.toLocaleString()} sats</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-300 font-semibold">Saldo minimo exigido</span>
                            <span className="text-white font-bold">{preview.requiredAvailableSats.toLocaleString()} sats</span>
                          </div>
                          <p className="text-[10px] text-gray-500 pt-0.5">
                            * 1o mes: {preview.totalChargeSats.toLocaleString()} sats. Depois disso, a cobranca recorrente fica em {preview.recurringChargeSats.toLocaleString()} sats (+2%) e a garantia permanece bloqueada.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {hasCredentials && (
                <label className="flex items-start gap-3 p-3 rounded-xl bg-[#252525] border border-gray-700">
                  <input
                    type="checkbox"
                    checked={shareCredentials}
                    onChange={(event) => setShareCredentials(event.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-600 text-[#5A5A40] focus:ring-[#5A5A40] bg-[#222]"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {paymentMode === 'bitcoin' ? 'Liberar senha apos o pagamento' : 'Liberar senha apos a aceitacao'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {paymentMode === 'bitcoin'
                        ? 'Se ficar desligado, o convite continua valido, mas o app avisa em vermelho que a senha nao foi disponibilizada.'
                        : 'Se ativado, esse amigo recebe as credenciais assim que aceitar o convite.'}
                    </p>
                  </div>
                </label>
              )}

              {paymentMode === 'bitcoin' && hasCredentials && !shareCredentials && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-orange-900/10 border border-orange-900/30">
                  <Zap size={15} className="text-orange-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-400">
                    O pagante entra na assinatura, mas o app mostrara em vermelho que voce nao disponibilizou a senha.
                  </p>
                </div>
              )}

              <button
                onClick={handleShare}
                disabled={sharing || !selected || (paymentMode === 'bitcoin' && satsNum <= 0)}
                className="w-full py-3.5 bg-[#d0d0a0] text-[#0a0a0a] rounded-xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-40 mt-2"
              >
                {sharing ? 'Compartilhando...' : 'Confirmar compartilhamento'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
