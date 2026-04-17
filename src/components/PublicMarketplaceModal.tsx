import React, { useEffect, useMemo, useState } from 'react';
import { Search, Globe, X, RefreshCw, Zap, MessageSquare, UserRound } from 'lucide-react';
import { supabase } from '../supabase';
import { Currency, Subscription } from '../types';
import { bestLogoUrl } from '../lib/logos';
import { formatCurrency } from '../lib/utils';
import { useAppContext } from '../AppContext';
import {
  WalletSnapshot,
  chargeSharedMembership,
  getPlatformJoinPreview,
  getWalletSnapshot,
} from '../lib/platformPayments';
import {
  PUBLIC_SERVICE_BUCKETS,
  PublicServiceBucket,
  getMarketplaceCategoryLabel,
  getPublicServiceBucket,
  matchesMarketplaceSearch,
} from '../lib/publicCatalog';

type Lang = 'pt' | 'en' | 'es' | 'it';
const t = (lang: Lang, pt: string, en: string, es: string, it: string) =>
  ({ pt, en, es, it }[lang] ?? en);

interface MarketplaceMemberRow {
  id: string;
  subscription_id: string;
  owner_id: string;
  member_id: string;
  amount: number;
  currency: Currency | string;
  accepted: boolean;
  payment_mode?: 'immediate' | 'bitcoin';
  payment_type?: 'onetime' | 'monthly';
  bitcoin_amount_sats?: number;
  payment_status?: 'unpaid' | 'paid' | 'active' | 'overdue' | 'disputed' | 'cancelled';
  share_credentials?: boolean;
  credentials_unlocked?: boolean;
  pending_release_until?: string | null;
}

interface MarketplaceComment {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author?: {
    name?: string;
    username?: string;
  };
}

interface MarketplaceSubscription extends Subscription {
  owner?: {
    id: string;
    name?: string;
    username?: string;
  };
  joinedEntry?: MarketplaceMemberRow | null;
}

interface Props {
  userId: string;
  onClose: () => void;
}

type DiscoveryTab = 'search' | 'services' | 'categories';

const normalizeMarketplaceSubscription = (row: any): MarketplaceSubscription => ({
  ...(row || {}),
  id: String(row?.id || ''),
  name: row?.name || 'Assinatura publica',
  emoji: row?.emoji || '📦',
  category: row?.category || 'Outros',
  costAmount: Number(row?.costAmount) || 0,
  costCurrency: (row?.costCurrency as Currency) || 'BRL',
  billingCycle: row?.billingCycle === 'Yearly' ? 'Yearly' : 'Monthly',
  dueDate: Number(row?.dueDate) || 1,
  subItems: Array.isArray(row?.subItems) ? row.subItems : [],
  paymentMethod: row?.paymentMethod || 'Outro',
  paymentSource: row?.paymentSource || 'Compartilhado',
  hasCashback: !!row?.hasCashback,
  cashbackPercentage: Number(row?.cashbackPercentage) || 0,
  hasIncome: !!row?.hasIncome,
  incomeAmount: Number(row?.incomeAmount) || 0,
  incomeCurrency: (row?.incomeCurrency as Currency) || 'BRL',
  incomeFrequency: row?.incomeFrequency === 'Yearly' ? 'Yearly' : 'Monthly',
  incomeSourceDescription: row?.incomeSourceDescription || '',
  sharedWith: Array.isArray(row?.sharedWith) ? row.sharedWith : [],
  isPublic: typeof row?.isPublic === 'boolean' ? row.isPublic : !!row?.is_public,
  allowPublicParticipants: typeof row?.allowPublicParticipants === 'boolean'
    ? row.allowPublicParticipants
    : !!row?.allow_public_participants,
  publicSharePriceSats: Number(row?.publicSharePriceSats ?? row?.public_share_price_sats) || 0,
  publicPaymentType: (row?.publicPaymentType ?? row?.public_payment_type) === 'monthly' ? 'monthly' : 'onetime',
  publicCredentialsEnabled: typeof row?.publicCredentialsEnabled === 'boolean'
    ? row.publicCredentialsEnabled
    : !!row?.public_credentials_enabled,
});

const canReadComments = (listing: MarketplaceSubscription | null, userId: string) => {
  if (!listing) return false;
  if (listing.owner?.id === userId) return true;
  return !!listing.joinedEntry && ['paid', 'active'].includes(listing.joinedEntry.payment_status || '');
};

export function PublicMarketplaceModal({ userId, onClose }: Props) {
  const { language } = useAppContext();
  const tx = (pt: string, en: string, es: string, it: string) =>
    t(language as Lang, pt, en, es, it);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletSnapshot, setWalletSnapshot] = useState<WalletSnapshot | null>(null);
  const [listings, setListings] = useState<MarketplaceSubscription[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<DiscoveryTab>('search');
  const [serviceBucket, setServiceBucket] = useState<PublicServiceBucket>('Todos');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [comments, setComments] = useState<MarketplaceComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadWallet = async () => {
    try {
      setWalletSnapshot(await getWalletSnapshot(userId));
    } catch {
      setWalletSnapshot(null);
    }
  };

  const loadListings = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: subs, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('isPublic', true)
        .order('updatedAt', { ascending: false });

      if (error) throw error;

      const normalized = (((subs as any[] | null) || []).map(normalizeMarketplaceSubscription));
      const ownerIds = Array.from(new Set(normalized.map((listing: any) => listing.user_id).filter(Boolean)));
      const subscriptionIds = normalized.map((listing) => listing.id);

      const [{ data: owners }, { data: memberships }] = await Promise.all([
        ownerIds.length > 0
          ? supabase.from('users').select('id,name,username').in('id', ownerIds)
          : Promise.resolve({ data: [] }),
        subscriptionIds.length > 0
          ? supabase.from('subscription_members').select('*').eq('member_id', userId).in('subscription_id', subscriptionIds)
          : Promise.resolve({ data: [] }),
      ]);

      const ownersById = Object.fromEntries((((owners as any[] | null) || []).map((owner) => [owner.id, owner])));
      const membershipsBySubscriptionId = Object.fromEntries((((memberships as MarketplaceMemberRow[] | null) || []).map((row) => [row.subscription_id, row])));

      const nextListings = normalized.map((listing: any) => ({
        ...listing,
        owner: ownersById[listing.user_id] || undefined,
        joinedEntry: membershipsBySubscriptionId[listing.id] || null,
      }));

      setListings(nextListings);
      setSelectedId((current) => current && nextListings.some((listing) => listing.id === current) ? current : nextListings[0]?.id || null);
    } catch (error) {
      console.error('[BoaWallet] Failed to load public marketplace', error);
      setListings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadListings();
    void loadWallet();
  }, [userId]);

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedId) || null,
    [listings, selectedId]
  );

  useEffect(() => {
    const listing = selectedListing;
    if (!canReadComments(listing, userId)) {
      setComments([]);
      return;
    }

    void (async () => {
      setCommentsLoading(true);
      try {
        const { data, error } = await supabase
          .from('public_subscription_comments')
          .select('*')
          .eq('subscription_id', listing!.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const authorIds = Array.from(new Set((((data as MarketplaceComment[] | null) || []).map((comment) => comment.author_id))));
        const { data: authors } = authorIds.length > 0
          ? await supabase.from('users').select('id,name,username').in('id', authorIds)
          : { data: [] };

        const authorsById = Object.fromEntries((((authors as any[] | null) || []).map((author) => [author.id, author])));
        setComments((((data as MarketplaceComment[] | null) || []).map((comment) => ({
          ...comment,
          author: authorsById[comment.author_id],
        }))));
      } catch (error) {
        console.error('[BoaWallet] Failed to load comments', error);
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }
    })();
  }, [selectedListing, userId]);

  const categories = useMemo(
    () => ['Todas', ...Array.from(new Set(listings.map((listing) => getMarketplaceCategoryLabel(listing))))],
    [listings]
  );

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      if (!matchesMarketplaceSearch(listing, query)) return false;
      if (tab === 'services' && serviceBucket !== 'Todos' && getPublicServiceBucket(listing.name) !== serviceBucket) return false;
      if (tab === 'categories' && categoryFilter !== 'Todas' && getMarketplaceCategoryLabel(listing) !== categoryFilter) return false;
      return true;
    });
  }, [listings, query, tab, serviceBucket, categoryFilter]);

  const handleJoin = async (listing: MarketplaceSubscription) => {
    if (!listing.allowPublicParticipants || listing.owner?.id === userId) return;
    if (!listing.owner?.id) {
      setStatusMessage('Nao foi possivel localizar o dono dessa assinatura.');
      return;
    }

    setJoiningId(listing.id);
    setStatusMessage('');

    try {
      const existing = listing.joinedEntry;
      let memberRowId = existing?.id;

      if (!memberRowId) {
        const { data, error } = await supabase
          .from('subscription_members')
          .insert({
            subscription_id: listing.id,
            owner_id: listing.owner?.id,
            member_id: userId,
            amount: listing.publicSharePriceSats || 0,
            currency: 'SATS',
            accepted: false,
            payment_mode: 'bitcoin',
            payment_type: listing.publicPaymentType || 'onetime',
            bitcoin_amount_sats: listing.publicSharePriceSats || 0,
            payment_status: 'unpaid',
            share_credentials: !!listing.publicCredentialsEnabled,
            credentials_unlocked: false,
            public_join: true,
          })
          .select('*')
          .single();

        if (error) throw error;
        memberRowId = (data as MarketplaceMemberRow).id;
      }

      await chargeSharedMembership({
        memberRowId: memberRowId!,
        subscriptionId: listing.id,
        payerId: userId,
        ownerId: listing.owner?.id || '',
        amountSats: listing.publicSharePriceSats || 0,
        paymentType: listing.publicPaymentType || 'onetime',
        releaseCredentials: !!listing.publicCredentialsEnabled,
      });

      setStatusMessage('Entrada confirmada com saldo interno.');
      await loadListings(true);
      await loadWallet();
    } catch (error: any) {
      const rawMessage = error?.message || '';
      const isSchemaError = rawMessage.toLowerCase().includes('column')
        || rawMessage.toLowerCase().includes('relation')
        || rawMessage.toLowerCase().includes('schema cache');
      setStatusMessage(
        isSchemaError
          ? 'O banco ainda nao recebeu a migracao completa do marketplace. Execute o SQL novo e tente de novo.'
          : rawMessage || 'Nao foi possivel concluir a entrada agora.'
      );
    } finally {
      setJoiningId(null);
    }
  };

  const handleCreateComment = async () => {
    if (!selectedListing || !commentText.trim() || !canReadComments(selectedListing, userId)) return;
    if (!selectedListing.owner?.id) return;

    setCommentSaving(true);
    try {
      const { error } = await supabase.from('public_subscription_comments').insert({
        subscription_id: selectedListing.id,
        author_id: userId,
        owner_id: selectedListing.owner?.id,
        body: commentText.trim(),
      });

      if (error) throw error;

      setCommentText('');
      await loadListings(true);
      setSelectedId(selectedListing.id);
    } catch (error) {
      console.error('[BoaWallet] Failed to save comment', error);
    } finally {
      setCommentSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl border border-gray-700 bg-[#111] shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1c1c12]">
              <Globe size={18} className="text-[#d0d0a0]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{tx('Assinaturas publicas', 'Public subscriptions', 'Suscripciones publicas', 'Abbonamenti pubblici')}</h3>
              <p className="text-xs text-gray-500">{tx('Buscar, filtrar e entrar em cotas abertas', 'Search, filter and join open slots', 'Busca, filtra y unete a cuotas abiertas', 'Cerca, filtra e unisciti alle quote aperte')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { void loadListings(true); void loadWallet(); }} className="rounded-xl border border-gray-800 bg-[#1a1a1a] p-2 text-gray-400 hover:text-white">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="rounded-xl border border-gray-800 bg-[#1a1a1a] p-2 text-gray-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid h-[calc(90vh-73px)] grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-r border-gray-800 p-5 overflow-y-auto space-y-4">
            {walletSnapshot && (
              <div className="grid grid-cols-3 gap-3">
                <MarketplaceStat label={tx('Total', 'Total', 'Total', 'Totale')} value={`${walletSnapshot.balanceSats.toLocaleString()} sats`} />
                <MarketplaceStat label={tx('Reservado', 'Reserved', 'Reservado', 'Riservato')} value={`${walletSnapshot.reservedSats.toLocaleString()} sats`} accent="warning" />
                <MarketplaceStat label={tx('Disponivel', 'Available', 'Disponible', 'Disponibile')} value={`${walletSnapshot.availableSats.toLocaleString()} sats`} accent="success" />
              </div>
            )}

            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tx('Buscar assinatura, categoria ou @username...', 'Search subscription, category or @username...', 'Buscar suscripcion, categoria o @usuario...', 'Cerca abbonamento, categoria o @username...')}
                className="w-full rounded-2xl border border-gray-700 bg-[#1a1a1a] py-3.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-600 focus:border-[#d0d0a0]/50 focus:outline-none"
              />
            </div>

            <div className="flex gap-1 rounded-2xl border border-gray-800 bg-[#1a1a1a] p-1">
              {([
                { id: 'search',     label: tx('Buscar',     'Search',     'Buscar',     'Cerca') },
                { id: 'services',   label: tx('Servicos',   'Services',   'Servicios',  'Servizi') },
                { id: 'categories', label: tx('Categorias', 'Categories', 'Categorias', 'Categorie') },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id as DiscoveryTab)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${tab === item.id ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'services' && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {PUBLIC_SERVICE_BUCKETS.map((bucket) => (
                  <button
                    key={bucket}
                    onClick={() => setServiceBucket(bucket)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${serviceBucket === bucket ? 'border-[#d0d0a0] bg-[#2a2a1a] text-[#d0d0a0]' : 'border-gray-800 bg-[#1a1a1a] text-gray-500 hover:text-white'}`}
                  >
                    {bucket}
                  </button>
                ))}
              </div>
            )}

            {tab === 'categories' && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${categoryFilter === category ? 'border-[#d0d0a0] bg-[#2a2a1a] text-[#d0d0a0]' : 'border-gray-800 bg-[#1a1a1a] text-gray-500 hover:text-white'}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}

            {statusMessage && (
              <div className="rounded-2xl border border-[#5A5A40] bg-[#1a1a10] px-4 py-3 text-sm text-[#d0d0a0]">
                {statusMessage}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
                <RefreshCw size={16} className="animate-spin" />
                <span className="text-sm">{tx('Carregando catalogo...', 'Loading catalog...', 'Cargando catalogo...', 'Caricamento catalogo...')}</span>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-800 bg-[#1a1a1a] px-6 py-16 text-center text-gray-500">
                {tx('Nenhuma assinatura publica encontrada com esse filtro.', 'No public subscriptions found for this filter.', 'No se encontraron suscripciones publicas con ese filtro.', 'Nessun abbonamento pubblico trovato con questo filtro.')}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredListings.map((listing) => {
                  const bucket = getPublicServiceBucket(listing.name);
                  const selected = listing.id === selectedId;
                  return (
                    <button
                      key={listing.id}
                      onClick={() => setSelectedId(listing.id)}
                      className={`w-full rounded-3xl border p-4 text-left transition-colors ${selected ? 'border-[#5A5A40] bg-[#1b1b12]' : 'border-gray-800 bg-[#1a1a1a] hover:border-gray-700'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#252525]">
                          {bestLogoUrl(listing.logoUrl, listing.name) ? (
                            <img
                              src={bestLogoUrl(listing.logoUrl, listing.name) || ''}
                              alt={listing.name}
                              className="h-full w-full object-contain bg-white p-1"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xl">{listing.emoji}</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-white">{listing.name}</p>
                            <span className="rounded-full border border-[#5A5A40] bg-[#2a2a1a] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#d0d0a0]">
                              {bucket}
                            </span>
                            <span className="rounded-full border border-gray-800 bg-[#151515] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              {listing.category}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {listing.owner?.username ? `@${listing.owner.username}` : listing.owner?.name || tx('Usuario publico', 'Public user', 'Usuario publico', 'Utente pubblico')}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-semibold text-white">{formatCurrency(listing.costAmount || 0, listing.costCurrency)}</span>
                            {listing.allowPublicParticipants ? (
                              <span className="text-orange-300">{tx('Entrada:', 'Entry:', 'Entrada:', 'Accesso:')} {listing.publicSharePriceSats?.toLocaleString() || 0} sats</span>
                            ) : (
                              <span className="text-gray-500">{tx('Somente via convite', 'Invite only', 'Solo por invitacion', 'Solo su invito')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="overflow-y-auto p-5">
            {!selectedListing ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-gray-800 bg-[#1a1a1a] px-6 text-center text-gray-500">
                {tx('Selecione uma assinatura publica para ver os detalhes.', 'Select a public subscription to see its details.', 'Selecciona una suscripcion publica para ver los detalles.', 'Seleziona un abbonamento pubblico per vederne i dettagli.')}
              </div>
            ) : (
              <MarketplaceDetails
                listing={selectedListing}
                currentUserId={userId}
                walletSnapshot={walletSnapshot}
                comments={comments}
                commentsLoading={commentsLoading}
                commentText={commentText}
                commentSaving={commentSaving}
                joining={joiningId === selectedListing.id}
                onCommentTextChange={setCommentText}
                onCreateComment={handleCreateComment}
                onJoin={() => handleJoin(selectedListing)}
                canReadComments={canReadComments(selectedListing, userId)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketplaceStat({ label, value, accent }: { label: string; value: string; accent?: 'warning' | 'success' }) {
  const accentClass = accent === 'warning'
    ? 'text-orange-300 border-orange-900/30'
    : accent === 'success'
      ? 'text-emerald-300 border-emerald-900/30'
      : 'text-[#d0d0a0] border-gray-800';

  return (
    <div className={`rounded-2xl border bg-[#1a1a1a] px-4 py-3 ${accentClass}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function MarketplaceDetails({
  listing,
  currentUserId,
  walletSnapshot,
  comments,
  commentsLoading,
  commentText,
  commentSaving,
  joining,
  onCommentTextChange,
  onCreateComment,
  onJoin,
  canReadComments,
}: {
  listing: MarketplaceSubscription;
  currentUserId: string;
  walletSnapshot: WalletSnapshot | null;
  comments: MarketplaceComment[];
  commentsLoading: boolean;
  commentText: string;
  commentSaving: boolean;
  joining: boolean;
  onCommentTextChange: (value: string) => void;
  onCreateComment: () => void;
  onJoin: () => void;
  canReadComments: boolean;
}) {
  const { language } = useAppContext();
  const tx = (pt: string, en: string, es: string, it: string) =>
    t(language as Lang, pt, en, es, it);

  const logoUrl = bestLogoUrl(listing.logoUrl, listing.name);
  const preview = getPlatformJoinPreview(listing.publicSharePriceSats || 0, listing.publicPaymentType || 'onetime');
  const joinedStatus = listing.joinedEntry?.payment_status;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-gray-800 bg-[#1a1a1a] p-5">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#252525]">
            {logoUrl ? (
              <img src={logoUrl} alt={listing.name} className="h-full w-full object-contain bg-white p-1" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl">{listing.emoji}</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-xl font-bold text-white">{listing.name}</h4>
              <span className="rounded-full border border-gray-800 bg-[#151515] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {listing.category}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {listing.owner?.username
                ? tx(`Oferta publica de @${listing.owner.username}`, `Public offer by @${listing.owner.username}`, `Oferta publica de @${listing.owner.username}`, `Offerta pubblica di @${listing.owner.username}`)
                : listing.owner?.name || tx('Oferta publica', 'Public offer', 'Oferta publica', 'Offerta pubblica')}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <DetailCard label={tx('Custo da assinatura', 'Subscription cost', 'Costo de suscripcion', 'Costo abbonamento')} value={formatCurrency(listing.costAmount || 0, listing.costCurrency)} />
          <DetailCard label={tx('Entrada publica', 'Public entry', 'Entrada publica', 'Accesso pubblico')} value={`${listing.publicSharePriceSats?.toLocaleString() || 0} sats`} accent="warning" />
          <DetailCard label={tx('Tipo', 'Type', 'Tipo', 'Tipo')} value={listing.publicPaymentType === 'monthly' ? tx('Compromisso mensal', 'Monthly commitment', 'Compromiso mensual', 'Impegno mensile') : tx('Pagamento unico', 'One-time payment', 'Pago unico', 'Pagamento unico')} />
          <DetailCard label={tx('Senha', 'Password', 'Contrasena', 'Password')} value={listing.publicCredentialsEnabled ? tx('Liberada apos entrada', 'Released after entry', 'Liberada tras entrada', 'Rilasciata dopo accesso') : tx('Nao disponibilizada', 'Not provided', 'No disponible', 'Non disponibile')} accent={listing.publicCredentialsEnabled ? 'success' : 'danger'} />
        </div>

        <div className="mt-5 space-y-3 rounded-2xl border border-orange-900/30 bg-orange-900/10 p-4">
          <div className="flex items-center gap-2 text-orange-300">
            <Zap size={15} />
            <span className="text-sm font-semibold">{tx('Resumo da entrada', 'Entry summary', 'Resumen de entrada', 'Riepilogo accesso')}</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <LineItem label={tx('Usuario recebe', 'User receives', 'Usuario recibe', 'Utente riceve')} value={`${preview.sellerAmountSats.toLocaleString()} sats`} />
            <LineItem label={tx('Taxa da plataforma', 'Platform fee', 'Tarifa de plataforma', 'Commissione piattaforma')} value={`${preview.platformFeeSats.toLocaleString()} sats`} />
            <LineItem label={tx('Debito inicial', 'Initial charge', 'Cargo inicial', 'Addebito iniziale')} value={`${preview.totalChargeSats.toLocaleString()} sats`} strong />
            {listing.publicPaymentType === 'monthly' && (
              <>
                <LineItem label={tx('Garantia bloqueada', 'Locked guarantee', 'Garantia bloqueada', 'Garanzia bloccata')} value={`${preview.guaranteeSats.toLocaleString()} sats`} />
                <LineItem label={tx('Saldo minimo exigido', 'Minimum balance required', 'Saldo minimo requerido', 'Saldo minimo richiesto')} value={`${preview.requiredAvailableSats.toLocaleString()} sats`} strong />
                <p className="pt-1 text-[11px] text-gray-400">
                  {tx(
                    `Depois da entrada, a cobranca mensal passa a ${preview.recurringChargeSats.toLocaleString()} sats (+2%) e a garantia permanece reservada.`,
                    `After entry, the monthly charge becomes ${preview.recurringChargeSats.toLocaleString()} sats (+2%) and the guarantee stays locked.`,
                    `Tras la entrada, el cargo mensual pasa a ${preview.recurringChargeSats.toLocaleString()} sats (+2%) y la garantia permanece bloqueada.`,
                    `Dopo l accesso, l addebito mensile diventa ${preview.recurringChargeSats.toLocaleString()} sats (+2%) e la garanzia rimane bloccata.`
                  )}
                </p>
              </>
            )}
            {walletSnapshot && (
              <LineItem label={tx('Seu saldo disponivel', 'Your available balance', 'Tu saldo disponible', 'Il tuo saldo disponibile')} value={`${walletSnapshot.availableSats.toLocaleString()} sats`} strong />
            )}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {listing.allowPublicParticipants ? (
            listing.owner?.id === currentUserId ? (
              <div className="rounded-2xl border border-gray-800 bg-[#151515] px-4 py-3 text-sm text-gray-500">
                {tx('Esta e a sua propria oferta publica.', 'This is your own public offer.', 'Esta es tu propia oferta publica.', 'Questa e la tua offerta pubblica.')}
              </div>
            ) : (
              <button
                onClick={onJoin}
                disabled={joining || !!listing.joinedEntry && ['paid', 'active'].includes(joinedStatus || '')}
                className="w-full rounded-2xl bg-[#d0d0a0] px-4 py-3 text-sm font-bold text-[#0a0a0a] disabled:opacity-50"
              >
                {listing.joinedEntry && ['paid', 'active'].includes(joinedStatus || '')
                  ? tx('Entrada ja ativa', 'Entry already active', 'Entrada ya activa', 'Accesso gia attivo')
                  : joining
                    ? tx('Processando entrada...', 'Processing entry...', 'Procesando entrada...', 'Elaborazione accesso...')
                    : tx('Entrar com saldo interno', 'Join with internal balance', 'Unirse con saldo interno', 'Accedi con saldo interno')}
              </button>
            )
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-[#151515] px-4 py-3 text-sm text-gray-500">
              {tx('Esta assinatura publica aparece no catalogo, mas o dono nao abriu vagas publicas.', 'This public subscription appears in the catalog but the owner has not opened public slots.', 'Esta suscripcion publica aparece en el catalogo, pero el dueno no abrio cupos publicos.', 'Questo abbonamento pubblico appare nel catalogo, ma il proprietario non ha aperto posti pubblici.')}
            </div>
          )}

          <div className="rounded-2xl border border-gray-800 bg-[#151515] px-4 py-3 text-sm text-gray-400">
            <div className="flex items-center gap-2 text-[#d0d0a0]">
              <UserRound size={14} />
              <span className="font-semibold">{tx('Contato privado', 'Private contact', 'Contacto privado', 'Contatto privato')}</span>
            </div>
            <p className="mt-2">
              {listing.owner?.username
                ? tx(`Fale em privado com @${listing.owner.username} depois da entrada.`, `Message @${listing.owner.username} privately after joining.`, `Habla en privado con @${listing.owner.username} despues de unirte.`, `Scrivi in privato a @${listing.owner.username} dopo l accesso.`)
                : tx('O dono nao definiu @username publico ainda.', 'The owner has not set a public @username yet.', 'El dueno aun no definio un @usuario publico.', 'Il proprietario non ha ancora impostato un @username pubblico.')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-800 bg-[#1a1a1a] p-5">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#d0d0a0]" />
          <h5 className="text-sm font-semibold text-white">{tx('Comentarios', 'Comments', 'Comentarios', 'Commenti')}</h5>
        </div>

        {!canReadComments ? (
          <div className="mt-4 rounded-2xl border border-red-900/30 bg-red-900/10 px-4 py-3 text-sm text-red-300">
            {tx('Os comentarios so aparecem depois do pagamento da entrada.', 'Comments are only visible after paying the entry fee.', 'Los comentarios solo aparecen despues del pago de entrada.', 'I commenti appaiono solo dopo il pagamento dell accesso.')}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-gray-800 bg-[#151515] p-3">
              <textarea
                value={commentText}
                onChange={(event) => onCommentTextChange(event.target.value)}
                rows={3}
                placeholder={tx('Escreva um comentario sobre a assinatura...', 'Write a comment about this subscription...', 'Escribe un comentario sobre la suscripcion...', 'Scrivi un commento su questo abbonamento...')}
                className="w-full resize-none bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
              />
              <div className="mt-3 flex justify-end">
                <button
                  onClick={onCreateComment}
                  disabled={commentSaving || !commentText.trim()}
                  className="rounded-xl bg-[#2a2a1a] px-3 py-2 text-xs font-semibold text-[#d0d0a0] disabled:opacity-50"
                >
                  {commentSaving
                    ? tx('Publicando...', 'Publishing...', 'Publicando...', 'Pubblicazione...')
                    : tx('Publicar comentario', 'Post comment', 'Publicar comentario', 'Pubblica commento')}
                </button>
              </div>
            </div>

            {commentsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <RefreshCw size={14} className="animate-spin" />
                <span>{tx('Carregando comentarios...', 'Loading comments...', 'Cargando comentarios...', 'Caricamento commenti...')}</span>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-500">{tx('Ainda nao ha comentarios nessa assinatura.', 'No comments yet on this subscription.', 'Todavia no hay comentarios en esta suscripcion.', 'Ancora nessun commento su questo abbonamento.')}</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-gray-800 bg-[#151515] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-[#d0d0a0]">
                        {comment.author?.username ? `@${comment.author.username}` : comment.author?.name || tx('Usuario', 'User', 'Usuario', 'Utente')}
                      </p>
                      <p className="text-[11px] text-gray-500">{new Date(comment.created_at).toLocaleString()}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{comment.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailCard({ label, value, accent }: { label: string; value: string; accent?: 'warning' | 'success' | 'danger' }) {
  const accentClass = accent === 'warning'
    ? 'border-orange-900/30 text-orange-300'
    : accent === 'success'
      ? 'border-emerald-900/30 text-emerald-300'
      : accent === 'danger'
        ? 'border-red-900/30 text-red-300'
        : 'border-gray-800 text-white';

  return (
    <div className={`rounded-2xl border bg-[#151515] px-4 py-3 ${accentClass}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function LineItem({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-gray-400 ${strong ? 'font-semibold text-gray-200' : ''}`}>{label}</span>
      <span className={`text-right ${strong ? 'font-bold text-white' : 'text-white'}`}>{value}</span>
    </div>
  );
}
