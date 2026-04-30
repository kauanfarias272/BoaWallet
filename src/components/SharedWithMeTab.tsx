import React, { useEffect, useRef, useState } from 'react';
import { Users, Check, X, Clock, RefreshCw, Search, Share2, Zap, AlertCircle, ShieldAlert } from 'lucide-react';
import { supabase } from '../supabase';
import { Subscription } from '../types';
import { formatCurrency } from '../lib/utils';
import { bestLogoUrl } from '../lib/logos';
import { FoundBoaUser, searchBoaUsers, searchCachedBoaUsers } from '../lib/userSearch';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';
import { withTimeout } from '../lib/requestTimeout';
import {
  WalletSnapshot,
  chargeSharedMembership,
  disputeLatestSharedMembershipPayment,
  getPlatformJoinPreview,
  getWalletSnapshot,
} from '../lib/platformPayments';

interface SharedEntry {
  id: string;
  subscription_id: string;
  owner_id: string;
  member_id: string;
  amount: number;
  currency: string;
  accepted: boolean;
  created_at: string;
  payment_mode?: 'immediate' | 'bitcoin';
  payment_type?: 'onetime' | 'monthly';
  bitcoin_amount_sats?: number;
  payment_status?: 'unpaid' | 'paid' | 'active' | 'overdue' | 'disputed' | 'cancelled';
  credentials_unlocked?: boolean;
  share_credentials?: boolean;
  platform_fee_sats?: number;
  guarantee_sats?: number;
  pending_release_until?: string | null;
  latest_payment_event_id?: string | null;
  subscription?: {
    id: string;
    name: string;
    emoji: string;
    logoUrl?: string;
    costAmount: number;
    costCurrency: string;
    billingCycle: string;
  };
  owner?: {
    id: string;
    name?: string;
    username?: string;
  };
}

interface FoundUser extends FoundBoaUser {}

interface Props {
  userId: string;
  subscriptions: Subscription[];
  onShareWithUser: (user: FoundUser) => void;
}

type Tab = 'received' | 'sent' | 'users';
type PayState = 'idle' | 'paying' | 'paid' | 'error';

type TFn = ReturnType<typeof useTranslation>;

const hasSharedAccess = (entry: Pick<SharedEntry, 'accepted' | 'payment_status'>) =>
  !!entry.accepted || ['paid', 'active'].includes(entry.payment_status || '');

interface SharedCardProps {
  entry: SharedEntry;
  pending: boolean;
  actionId: string | null;
  walletSnapshot: WalletSnapshot | null;
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
  onPaymentComplete: () => Promise<void>;
  onDispute: () => Promise<void>;
  t: TFn;
}

interface UserCardProps {
  user: FoundUser;
  onShare: () => void;
  t: TFn;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

export function SharedWithMeTab({ userId, subscriptions: _subscriptions, onShareWithUser }: Props) {
  const { language } = useAppContext();
  const t = useTranslation(language);
  const [tab, setTab] = useState<Tab>('received');
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [sentEntries, setSentEntries] = useState<SharedEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [loadingSent, setLoadingSent] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [walletSnapshot, setWalletSnapshot] = useState<WalletSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchWallet = async () => {
    try {
      setWalletSnapshot(await withTimeout(getWalletSnapshot(userId), 4500, 'Wallet snapshot timed out'));
    } catch {
      setWalletSnapshot(null);
    }
  };

  const fetchShared = async () => {
    setLoadingEntries(true);
    try {
      const { data: members, error } = await withTimeout(
        supabase
          .from('subscription_members')
          .select('*')
          .eq('member_id', userId)
          .or('payment_status.neq.cancelled,payment_status.is.null')
          .order('created_at', { ascending: false }),
        7000,
        'Shared subscriptions request timed out'
      );

      if (error || !members) {
        setEntries([]);
        return;
      }

      const enriched = await Promise.all(
        members.map(async (member: SharedEntry) => {
          const [{ data: subscription }, { data: owner }] = await Promise.all([
            withTimeout(
              supabase
                .from('subscriptions')
                .select('id,name,emoji,logoUrl,costAmount,costCurrency,billingCycle')
                .eq('id', member.subscription_id)
                .maybeSingle(),
              4500,
              'Shared subscription detail timed out'
            ).catch(() => ({ data: null })),
            withTimeout(
              supabase
                .from('users')
                .select('id,name,username')
                .eq('id', member.owner_id)
                .maybeSingle(),
              4500,
              'Shared subscription owner timed out'
            ).catch(() => ({ data: null })),
          ]);

          return {
            ...member,
            subscription: subscription ?? {
              id: member.subscription_id,
              name: 'Assinatura compartilhada',
              emoji: 'B',
              costAmount: Number(member.amount) || 0,
              costCurrency: member.currency || 'BRL',
              billingCycle: 'Monthly',
            },
            owner: owner ?? undefined,
          };
        })
      );

      setEntries(enriched);
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  };

  // Fetch subscriptions the current user shared WITH others (as owner)
  const fetchSent = async () => {
    setLoadingSent(true);
    try {
      const { data: members, error } = await withTimeout(
        supabase
          .from('subscription_members')
          .select('*')
          .eq('owner_id', userId)
          .or('payment_status.neq.cancelled,payment_status.is.null')
          .order('created_at', { ascending: false }),
        7000,
        'Sent shared subscriptions request timed out'
      );

      if (error || !members) {
        setSentEntries([]);
        return;
      }

      const enriched = await Promise.all(
        members.map(async (member: SharedEntry) => {
          const [{ data: subscription }, { data: memberProfile }] = await Promise.all([
            withTimeout(
              supabase
                .from('subscriptions')
                .select('id,name,emoji,logoUrl,costAmount,costCurrency,billingCycle')
                .eq('id', member.subscription_id)
                .maybeSingle(),
              4500,
              'Sent shared subscription detail timed out'
            ).catch(() => ({ data: null })),
            withTimeout(
              supabase
                .from('users')
                .select('id,name,username')
                .eq('id', member.member_id)
                .maybeSingle(),
              4500,
              'Sent shared subscription member timed out'
            ).catch(() => ({ data: null })),
          ]);

          return {
            ...member,
            subscription: subscription ?? {
              id: member.subscription_id,
              name: 'Assinatura compartilhada',
              emoji: 'B',
              costAmount: Number(member.amount) || 0,
              costCurrency: member.currency || 'BRL',
              billingCycle: 'Monthly',
            },
            // reuse owner field to hold the member profile for display purposes
            owner: (memberProfile as any) ?? undefined,
          };
        })
      );

      setSentEntries(enriched);
    } catch {
      setSentEntries([]);
    } finally {
      setLoadingSent(false);
    }
  };

  useEffect(() => {
    void fetchShared();
    void fetchSent();
    void fetchWallet();
  }, [userId]);

  useEffect(() => {
    const cleanQuery = query.replace('@', '').trim();
    const instantResults = searchCachedBoaUsers(cleanQuery, userId, 10);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().startsWith('@') || cleanQuery) {
      setUserResults(instantResults);
    } else {
      setUserResults([]);
    }

    if (!cleanQuery) {
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(instantResults.length === 0);
      try {
        setUserResults(await searchBoaUsers(cleanQuery, userId, 10));
      } catch {
        setUserResults([]);
      }
      setSearching(false);
    }, 140);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, userId]);

  const respond = async (entryId: string, accept: boolean) => {
    setActionId(entryId);
    try {
      if (accept) {
        const { error: updateError } = await supabase
          .from('subscription_members')
          .update({
            accepted: true,
            payment_status: 'paid',
            credentials_unlocked: true,
          })
          .eq('id', entryId)
          .eq('member_id', userId);

        if (updateError) {
          const isColumnError = updateError.code === '42703' || updateError.message?.toLowerCase().includes('column');
          if (!isColumnError) throw updateError;

          const { error: legacyUpdateError } = await supabase
            .from('subscription_members')
            .update({
              accepted: true,
            })
            .eq('id', entryId)
            .eq('member_id', userId);

          if (legacyUpdateError) throw legacyUpdateError;
        }
      } else {
        await supabase.from('subscription_members').delete().eq('id', entryId).eq('member_id', userId);
      }

      await fetchShared();
    } catch {
      // keep UI stable
    } finally {
      setActionId(null);
    }
  };

  const pending = entries.filter((entry) => !hasSharedAccess(entry));
  const accepted = entries.filter(hasSharedAccess);
  const cleanQuery = query.replace('@', '').trim();
  const showCachedSuggestions = cleanQuery === '' && query.trim().startsWith('@') && userResults.length > 0;

  return (
    <div className="space-y-5">
      {walletSnapshot && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <WalletStatCard label="Saldo total" value={`${walletSnapshot.balanceSats.toLocaleString()} sats`} tone="neutral" />
          <WalletStatCard label="Garantia reservada" value={`${walletSnapshot.reservedSats.toLocaleString()} sats`} tone="warning" />
          <WalletStatCard label="Saldo disponivel" value={`${walletSnapshot.availableSats.toLocaleString()} sats`} tone="success" />
        </div>
      )}

      <div className="flex gap-1 p-1 bg-[#1a1a1a] border border-gray-800 rounded-2xl">
        <button
          onClick={() => setTab('received')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === 'received' ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
        >
          <Check size={14} />
          {t('shared.title')}
          {pending.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'received' ? 'bg-[#0a0a0a]/30 text-[#0a0a0a]' : 'bg-amber-500 text-white'}`}>
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab('sent'); void fetchSent(); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === 'sent' ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
        >
          <Share2 size={14} />
          {language === 'pt' ? 'Enviados' : language === 'es' ? 'Enviados' : language === 'it' ? 'Inviati' : 'Sent'}
          {sentEntries.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === 'sent' ? 'bg-[#0a0a0a]/30 text-[#0a0a0a]' : 'bg-[#5A5A40] text-[#d0d0a0]'}`}>
              {sentEntries.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === 'users' ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
        >
          <Users size={14} />
          {t('shared.findUsers')}
        </button>
      </div>

      {tab === 'received' && (
        <>
          {loadingEntries ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <RefreshCw size={22} className="animate-spin" />
              <p className="text-sm">{t('shared.loading')}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-gray-800 flex items-center justify-center">
                <Users size={28} className="text-gray-600" />
              </div>
              <div>
                <p className="text-gray-400 font-medium">{t('shared.empty')}</p>
                <p className="text-gray-600 text-sm mt-1">{t('shared.emptyDesc')}</p>
              </div>
              <button onClick={() => setTab('users')} className="text-[#d0d0a0] text-sm font-medium underline underline-offset-2">
                {t('shared.findUsers')}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {pending.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={13} className="text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                      {t('shared.pendingSection', { count: String(pending.length) })}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {pending.map((entry) => (
                      <SharedCard
                        key={entry.id}
                        entry={entry}
                        pending={true}
                        actionId={actionId}
                        walletSnapshot={walletSnapshot}
                        onAccept={() => respond(entry.id, true)}
                        onDecline={() => respond(entry.id, false)}
                        onPaymentComplete={async () => {
                          await fetchShared();
                          await fetchWallet();
                        }}
                        onDispute={async () => {
                          await fetchShared();
                          await fetchWallet();
                        }}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}
              {accepted.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Check size={13} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                      {t('shared.acceptedSection', { count: String(accepted.length) })}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {accepted.map((entry) => (
                      <SharedCard
                        key={entry.id}
                        entry={entry}
                        pending={false}
                        actionId={actionId}
                        walletSnapshot={walletSnapshot}
                        onAccept={() => undefined}
                        onDecline={() => respond(entry.id, false)}
                        onPaymentComplete={async () => {
                          await fetchShared();
                          await fetchWallet();
                        }}
                        onDispute={async () => {
                          await fetchShared();
                          await fetchWallet();
                        }}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'sent' && (
        <>
          {loadingSent ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <RefreshCw size={22} className="animate-spin" />
              <p className="text-sm">{t('shared.loading')}</p>
            </div>
          ) : sentEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-gray-800 flex items-center justify-center">
                <Share2 size={28} className="text-gray-600" />
              </div>
              <div>
                <p className="text-gray-400 font-medium">
                  {language === 'pt' ? 'Nenhum compartilhamento enviado' : language === 'es' ? 'Sin compartidos enviados' : language === 'it' ? 'Nessuna condivisione inviata' : 'No shares sent'}
                </p>
                <p className="text-gray-600 text-sm mt-1">
                  {language === 'pt' ? 'As assinaturas que voce compartilhou com amigos apareceram aqui.' : language === 'es' ? 'Aqui apareceran las suscripciones que compartes con amigos.' : language === 'it' ? 'Gli abbonamenti condivisi con amici appariranno qui.' : 'Subscriptions you share with friends will appear here.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {sentEntries.map((entry) => {
                const memberName = entry.owner?.name || entry.owner?.username || entry.member_id.slice(0, 8);
                const memberHandle = entry.owner?.username ? `@${entry.owner.username}` : null;
                const statusColors: Record<string, string> = {
                  unpaid: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
                  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
                  active: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
                  overdue: 'bg-red-500/15 text-red-300 border-red-500/25',
                  disputed: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
                  cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
                };
                const statusLabel = entry.payment_status || 'unpaid';
                const statusClass = statusColors[statusLabel] || statusColors.unpaid;

                return (
                  <div key={entry.id} className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-[#111] border border-gray-800 flex items-center justify-center text-xl shrink-0">
                      {entry.subscription?.emoji || '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{entry.subscription?.name || '—'}</p>
                      <p className="text-gray-500 text-xs mt-0.5 truncate">
                        {memberHandle ? <span className="text-[#d0d0a0]">{memberHandle}</span> : memberName}
                        {!memberHandle && <span className="ml-1 text-gray-600">· {memberName}</span>}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-white text-sm font-semibold">
                        {formatCurrency(entry.amount, entry.currency)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusClass}`}>
                        {statusLabel}
                      </span>
                      {!entry.accepted && (
                        <span className="text-[10px] text-amber-400">
                          {language === 'pt' ? 'aguardando' : language === 'es' ? 'pendiente' : language === 'it' ? 'in attesa' : 'pending'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('shared.searchPlaceholder')}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl pl-10 pr-4 py-3.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#d0d0a0]/50"
            />
            {searching && (
              <RefreshCw size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
            )}
          </div>

          {cleanQuery === '' && !showCachedSuggestions ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-gray-800 flex items-center justify-center">
                <Search size={24} className="text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm">{t('shared.searchEmpty')}</p>
            </div>
          ) : userResults.length === 0 && !searching ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">{t('shared.noUserFound', { query: cleanQuery })}</p>
              <p className="text-gray-600 text-xs mt-1">{t('shared.userMustSetUsername')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {userResults.map((result) => (
                <UserCard key={result.id} user={result} onShare={() => onShareWithUser(result)} t={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WalletStatCard({ label, value, tone }: { label: string; value: string; tone: 'neutral' | 'warning' | 'success' }) {
  const toneClass = tone === 'warning'
    ? 'border-orange-900/40 text-orange-300'
    : tone === 'success'
      ? 'border-emerald-900/40 text-emerald-300'
      : 'border-gray-800 text-[#d0d0a0]';

  return (
    <div className={`bg-[#1a1a1a] border rounded-2xl p-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}

const SharedCard: React.FC<SharedCardProps> = ({
  entry,
  pending,
  actionId,
  walletSnapshot,
  onAccept,
  onDecline,
  onPaymentComplete,
  onDispute,
  t,
}) => {
  const busy = actionId === entry.id;
  const sub = entry.subscription;
  const owner = entry.owner;
  const logoUrl = sub ? bestLogoUrl(sub.logoUrl, sub.name) : null;
  const isBitcoin = entry.payment_mode === 'bitcoin' && entry.payment_status !== 'paid' && entry.payment_status !== 'active';
  const preview = getPlatformJoinPreview(entry.bitcoin_amount_sats ?? 0, entry.payment_type === 'monthly' ? 'monthly' : 'onetime');
  const noPassword = !entry.share_credentials;
  const disputeWindowActive = !!entry.pending_release_until && new Date(entry.pending_release_until).getTime() > Date.now();

  const [payState, setPayState] = useState<PayState>('idle');
  const [payError, setPayError] = useState('');

  const handlePay = async () => {
    setPayState('paying');
    setPayError('');

    try {
      await chargeSharedMembership({
        memberRowId: entry.id,
        subscriptionId: entry.subscription_id,
        payerId: entry.member_id || '',
        ownerId: entry.owner_id,
        amountSats: entry.bitcoin_amount_sats ?? 0,
        paymentType: entry.payment_type === 'monthly' ? 'monthly' : 'onetime',
        releaseCredentials: !!entry.share_credentials,
      });

      setPayState('paid');
      await onPaymentComplete();
    } catch (error: any) {
      setPayState('error');
      setPayError(error?.message || 'Pagamento falhou.');
    }
  };

  const handleDispute = async () => {
    try {
      await disputeLatestSharedMembershipPayment({
        memberRowId: entry.id,
        payerId: entry.member_id || '',
      });
      await onDispute();
    } catch (error) {
      console.error('[BoaWallet] Failed to dispute payment', error);
    }
  };

  return (
    <div className={`bg-[#1a1a1a] border rounded-2xl p-4 ${pending ? (isBitcoin ? 'border-orange-800/40' : 'border-amber-800/40') : 'border-gray-800/50'}`}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#252525] flex items-center justify-center text-xl shrink-0 overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={sub?.name}
              className="w-full h-full object-contain p-0.5 bg-white"
              referrerPolicy="no-referrer"
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span>{sub?.emoji || '??'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate">{sub?.name || t('shared.subscription')}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('shared.sharedBy')} <span className="text-[#d0d0a0]">@{owner?.username || 'usuario'}</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-base font-bold text-white">{formatCurrency(entry.amount, entry.currency as any)}</span>
            <span className="text-xs text-gray-500">/ {sub?.billingCycle === 'Monthly' ? t('shared.monthly') : t('shared.yearly')}</span>
          </div>
        </div>
        {!pending && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-[10px] font-semibold">
            <Check size={10} /> {entry.payment_status === 'overdue' ? 'Em atraso' : t('shared.active')}
          </span>
        )}
      </div>

      {noPassword && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-900/40 bg-red-900/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>O usuario nao disponibilizou a senha.</span>
        </div>
      )}

      {pending && isBitcoin ? (
        <div className="mt-3 space-y-3">
          <div className="bg-[#252525] rounded-xl p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Cota do usuario</span>
              <span className="text-white font-semibold">{preview.sellerAmountSats.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Taxa plataforma</span>
              <span className="text-orange-300">{preview.platformFeeSats.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300 font-semibold">Debito inicial</span>
              <span className="text-orange-300 font-bold">{preview.totalChargeSats.toLocaleString()} sats</span>
            </div>
            {entry.payment_type === 'monthly' && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-400">Garantia bloqueada</span>
                  <span className="text-amber-300">{preview.guaranteeSats.toLocaleString()} sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300 font-semibold">Saldo minimo exigido</span>
                  <span className="text-white font-bold">{preview.requiredAvailableSats.toLocaleString()} sats</span>
                </div>
              </>
            )}
            {walletSnapshot && (
              <div className="pt-1 border-t border-gray-700 flex justify-between">
                <span className="text-gray-500">Seu saldo disponivel</span>
                <span className={walletSnapshot.availableSats >= preview.requiredAvailableSats ? 'text-emerald-300' : 'text-red-300'}>
                  {walletSnapshot.availableSats.toLocaleString()} sats
                </span>
              </div>
            )}
          </div>

          {entry.payment_type === 'monthly' && (
            <div className="flex items-start gap-2 rounded-xl border border-orange-900/30 bg-orange-900/10 px-3 py-2 text-xs text-gray-300">
              <Clock size={13} className="mt-0.5 text-orange-300 shrink-0" />
              <span>
                A primeira entrada usa a taxa de 50%. Depois disso, a cobranca mensal fica em {preview.recurringChargeSats.toLocaleString()} sats (+2%) e a garantia permanece reservada.
              </span>
            </div>
          )}

          {payState === 'error' && (
            <div className="flex items-start gap-2 rounded-xl border border-red-900/40 bg-red-900/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{payError}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handlePay}
              disabled={payState === 'paying'}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-orange-900/40 border border-orange-700 text-orange-300 text-sm font-semibold active:scale-95 transition-all disabled:opacity-50"
            >
              {payState === 'paying' ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              {payState === 'paying' ? 'Processando...' : 'Pagar com saldo'}
            </button>
            <button
              onClick={onDecline}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-800 text-gray-400 text-sm font-semibold active:scale-95 transition-all disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : pending ? (
        <div className="flex gap-2 mt-3">
          <button onClick={onAccept} disabled={busy} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-900/40 border border-emerald-800 text-emerald-400 text-sm font-semibold active:scale-95 transition-all disabled:opacity-50">
            <Check size={14} /> {t('shared.accept')}
          </button>
          <button onClick={onDecline} disabled={busy} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-800 text-gray-400 text-sm font-semibold active:scale-95 transition-all disabled:opacity-50">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {entry.pending_release_until && (
            <div className="rounded-xl border border-amber-900/30 bg-amber-900/10 px-3 py-2 text-xs text-gray-300">
              Repasse em custodia ate {formatDateTime(entry.pending_release_until)}.
            </div>
          )}
          {disputeWindowActive && (
            <button
              onClick={handleDispute}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-900/20 border border-red-900/40 text-red-300 text-sm font-semibold"
            >
              <ShieldAlert size={14} /> Senha incorreta
            </button>
          )}
          <button onClick={onDecline} disabled={busy} className="w-full py-2 text-gray-600 hover:text-red-400 text-xs transition-colors">
            {t('shared.leave')}
          </button>
        </div>
      )}
    </div>
  );
};

const UserCard: React.FC<UserCardProps> = ({ user, onShare, t }) => {
  const initial = (user.name || user.username).charAt(0).toUpperCase();
  const colors = ['#3b4a2f', '#2f3a4a', '#4a2f3b', '#2f4a3a', '#4a3a2f'];
  const bg = colors[initial.charCodeAt(0) % colors.length];

  return (
    <div className="flex items-center gap-3 bg-[#1a1a1a] border border-gray-800 rounded-2xl px-4 py-3">
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-[#d0d0a0] font-bold text-sm shrink-0" style={{ background: bg }}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{user.name || user.username}</p>
        <p className="text-gray-500 text-xs">@{user.username}</p>
      </div>
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 px-3 py-2 bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] rounded-xl text-xs font-semibold active:scale-95 transition-all hover:bg-[#3a3a20]"
      >
        <Share2 size={13} /> {t('shared.share')}
      </button>
    </div>
  );
};
