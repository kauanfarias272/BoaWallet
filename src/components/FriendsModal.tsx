import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Lock, RefreshCw, Search, Smartphone, UserPlus, Users, X, Zap } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { FriendProfile } from '../lib/friends';
import { Subscription } from '../types';
import { bestLogoUrl } from '../lib/logos';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../supabase';
import { withTimeout } from '../lib/requestTimeout';
import { FoundBoaUser, searchBoaUsers, searchCachedBoaUsers } from '../lib/userSearch';
import { isNfcSupported, startNfcScan, NfcBoaProfile, NfcScanHandle } from '../lib/nfc';

interface FriendsModalProps {
  currentUserId: string;
  currentUsername?: string;
  currentName?: string;
  friends: FriendProfile[];
  loading: boolean;
  onAddFriend: (friend: FoundBoaUser) => Promise<boolean>;
  onShareSubscription?: (friend: FoundBoaUser) => void;
  onClose: () => void;
}

const FRIEND_PUBLIC_SUBSCRIPTIONS_CACHE_PREFIX = 'boa_friend_public_subscriptions_v1:';

const readPublicSubscriptionsCache = (friendId: string): Subscription[] => {
  if (!friendId || typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(FRIEND_PUBLIC_SUBSCRIPTIONS_CACHE_PREFIX + friendId);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writePublicSubscriptionsCache = (friendId: string, subscriptions: Subscription[]) => {
  if (!friendId || typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(
      FRIEND_PUBLIC_SUBSCRIPTIONS_CACHE_PREFIX + friendId,
      JSON.stringify(subscriptions)
    );
  } catch {
    // ignore cache write failures
  }
};

export function FriendsModal({ currentUserId, currentUsername, currentName, friends, loading, onAddFriend, onShareSubscription, onClose }: FriendsModalProps) {
  const { language } = useAppContext();
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(friends[0]?.id ?? null);
  const [publicSubscriptions, setPublicSubscriptions] = useState<Subscription[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [friendResults, setFriendResults] = useState<FoundBoaUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const friendSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // NFC Beta
  const [nfcTab, setNfcTab] = useState(false);
  const nfcSupported = isNfcSupported();
  const [nfcActive, setNfcActive] = useState(false);
  const [nfcError, setNfcError] = useState('');
  const [nearbyUsers, setNearbyUsers] = useState<NfcBoaProfile[]>([]);
  const [addingNfcId, setAddingNfcId] = useState<string | null>(null);
  const nfcScanHandleRef = useRef<NfcScanHandle | null>(null);

  const tx = (pt: string, en: string, es: string, it: string) =>
    ({ pt, en, es, it }[language] ?? en);

  const stopNfcScan = () => {
    const activeHandle = nfcScanHandleRef.current;
    if (activeHandle) {
      activeHandle.stop();
      nfcScanHandleRef.current = null;
    }
    setNfcActive(false);
  };

  const handleNfcProfileRead = (profile: NfcBoaProfile) => {
    if (profile.userId === currentUserId) return;

    setNearbyUsers((prev: NfcBoaProfile[]) => {
      if (prev.some((u: NfcBoaProfile) => u.userId === profile.userId)) return prev;
      return [profile, ...prev];
    });
  };

  const handleNfcStartError = (err: Error) => {
    const name: string = (err as any).originalName || err.message.split(':')[0] || '';
    const msg = err.message.toLowerCase();
    const isUserActivation =
      msg.includes('user gesture') ||
      msg.includes('user activation') ||
      msg.includes('transient activation');
    const isPermission =
      name === 'NotAllowedError' ||
      msg.includes('notallowederror') ||
      msg.includes('not allowed') ||
      msg.includes('permission');
    const isDisabled =
      name === 'NotSupportedError' ||
      msg.includes('notsupportederror') ||
      msg.includes('not supported') ||
      msg.includes('not enabled') ||
      msg.includes('nfc is not');
    const isWebViewLimit =
      msg.includes('embedded') ||
      msg.includes('secure context') ||
      msg.includes('cross-origin');

    if (isUserActivation) {
      setNfcError(tx(
        'Toque em "Ativar NFC" e aceite a permissao quando o Android pedir.',
        'Tap "Enable NFC" and accept the permission when Android asks.',
        'Toca "Activar NFC" y acepta el permiso cuando Android lo pida.',
        'Tocca "Attiva NFC" e accetta il permesso quando Android lo richiede.'
      ));
      return;
    }

    if (isPermission) {
      setNfcError(tx(
        'Permissao NFC negada. Toque em "Ativar NFC" e permita o acesso no Android.',
        'NFC permission denied. Tap "Enable NFC" and allow access on Android.',
        'Permiso NFC denegado. Toca "Activar NFC" y permite el acceso en Android.',
        'Permesso NFC negato. Tocca "Attiva NFC" e consenti l accesso su Android.'
      ));
    } else if (isWebViewLimit) {
      setNfcError(tx(
        'NFC via WebView tem limitacoes neste Android. Tente no Chrome.',
        'NFC via WebView is limited on this Android. Try Chrome.',
        'NFC via WebView tiene limitaciones. Prueba en Chrome.',
        'NFC via WebView ha limitazioni. Prova su Chrome.'
      ));
    } else if (isDisabled) {
      setNfcError(tx(
        'NFC desabilitado ou nao suportado neste dispositivo.',
        'NFC disabled or not supported on this device.',
        'NFC deshabilitado o no compatible.',
        'NFC disabilitato o non supportato.'
      ));
    } else {
      setNfcError(tx(
        'Erro ao iniciar NFC',
        'Error starting NFC',
        'Error al iniciar NFC',
        'Errore NFC'
      ) + ': ' + (err.message || 'unknown'));
    }
  };

  const handleStartNfc = async () => {
    if (!nfcSupported) return;

    stopNfcScan();
    setNfcError('');

    try {
      const handle = await startNfcScan(
        handleNfcProfileRead,
        () => setNfcError(tx(
          'Erro ao ler NFC. Tente novamente.',
          'NFC read error. Try again.',
          'Error al leer NFC. Intentalo de nuevo.',
          'Errore di lettura NFC. Riprova.'
        ))
      );

      nfcScanHandleRef.current = handle;
      setNfcActive(true);
    } catch (err) {
      handleNfcStartError(err as Error);
    }
  };

  const handleToggleNfcTab = () => {
    if (nfcTab) {
      stopNfcScan();
      setNfcError('');
      setNfcTab(false);
      return;
    }

    setNearbyUsers([]);
    setNfcError('');
    setNfcTab(true);
  };

  useEffect(() => {
    return () => {
      const activeHandle = nfcScanHandleRef.current;
      if (activeHandle) {
        activeHandle.stop();
        nfcScanHandleRef.current = null;
      }
    };
  }, []);

  // ── NFC lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    return;

    let handle: NfcScanHandle | null = null;
    setNfcActive(false);
    setNfcError('');

    startNfcScan(
      (profile) => {
        if (profile.userId === currentUserId) return; // ignora o próprio usuário
        setNearbyUsers((prev: NfcBoaProfile[]) => {
          if (prev.some((u: NfcBoaProfile) => u.userId === profile.userId)) return prev;
          return [profile, ...prev];
        });
      },
      (err) => setNfcError(err.message)
    )
      .then((h) => {
        handle = h;
        nfcScanHandleRef.current = h;
        setNfcActive(true);
      })
      .catch((err: Error) => {
        const name: string = (err as any).originalName || err.message.split(':')[0] || '';
        const msg = err.message.toLowerCase();
        const isPermission =
          name === 'NotAllowedError' ||
          msg.includes('notallowederror') ||
          msg.includes('not allowed') ||
          msg.includes('permission');
        const isDisabled =
          name === 'NotSupportedError' ||
          msg.includes('notsupportederror') ||
          msg.includes('not supported') ||
          msg.includes('not enabled') ||
          msg.includes('nfc is not');
        const isWebViewLimit =
          msg.includes('embedded') ||
          msg.includes('secure context') ||
          msg.includes('cross-origin');

        if (isPermission) {
          setNfcError(tx(
            'Permissão NFC negada. Ative nas configurações do sistema.',
            'NFC permission denied. Enable it in system settings.',
            'Permiso NFC denegado. Actívalo en la configuración.',
            'Permesso NFC negato. Attivalo nelle impostazioni.'
          ));
        } else if (isWebViewLimit) {
          setNfcError(tx(
            'NFC via WebView tem limitações neste Android. Tente no Chrome.',
            'NFC via WebView is limited on this Android. Try Chrome.',
            'NFC via WebView tiene limitaciones. Prueba en Chrome.',
            'NFC via WebView ha limitazioni. Prova su Chrome.'
          ));
        } else if (isDisabled) {
          setNfcError(tx(
            'NFC desabilitado ou não suportado neste dispositivo.',
            'NFC disabled or not supported on this device.',
            'NFC deshabilitado o no compatible.',
            'NFC disabilitato o non supportato.'
          ));
        } else {
          setNfcError(tx(
            'Erro ao iniciar NFC',
            'Error starting NFC',
            'Error al iniciar NFC',
            'Errore NFC'
          ) + ': ' + (err.message || 'unknown'));
        }
      });

    return () => {
      handle?.stop();
      nfcScanHandleRef.current = null;
      setNfcActive(false);
    };
  }, [nfcTab, nfcSupported, currentUserId]);

  const handleAddNfcFriend = async (profile: NfcBoaProfile) => {
    setAddingNfcId(profile.userId);
    const candidate: FoundBoaUser = {
      id: profile.userId,
      username: profile.username,
      name: profile.name,
    };
    try {
      await onAddFriend(candidate);
      setNearbyUsers((prev: NfcBoaProfile[]) => prev.filter((u: NfcBoaProfile) => u.userId !== profile.userId));
    } finally {
      setAddingNfcId(null);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const selectedFriend = useMemo(
    () => friends.find((friend) => friend.id === selectedFriendId) || friends[0] || null,
    [friends, selectedFriendId]
  );

  useEffect(() => {
    if (!selectedFriendId && friends[0]?.id) {
      setSelectedFriendId(friends[0].id);
      return;
    }

    if (selectedFriendId && !friends.some((friend) => friend.id === selectedFriendId)) {
      setSelectedFriendId(friends[0]?.id ?? null);
    }
  }, [friends, selectedFriendId]);

  useEffect(() => {
    let cancelled = false;

    const loadPublicSubscriptions = async () => {
      if (!selectedFriend?.id) {
        setPublicSubscriptions([]);
        setLoadingSubscriptions(false);
        return;
      }

      const cachedSubscriptions = readPublicSubscriptionsCache(selectedFriend.id);
      if (cachedSubscriptions.length > 0) {
        setPublicSubscriptions(cachedSubscriptions);
        setLoadingSubscriptions(false);
      } else {
        setLoadingSubscriptions(true);
      }

      try {
        const { data } = await withTimeout(
          supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', selectedFriend.id)
            .eq('isPublic', true)
            .order('updatedAt', { ascending: false }),
          4500,
          'Public subscriptions request timed out'
        );

        if (cancelled) return;

        const visibleSubscriptions = (((data as Subscription[] | null) || []).filter(
          (subscription) => !subscription.status?.startsWith('cancelled')
        ));

        setPublicSubscriptions(visibleSubscriptions);
        writePublicSubscriptionsCache(selectedFriend.id, visibleSubscriptions);
      } catch {
        if (!cancelled && cachedSubscriptions.length === 0) setPublicSubscriptions([]);
      } finally {
        if (!cancelled) setLoadingSubscriptions(false);
      }
    };

    loadPublicSubscriptions();

    return () => {
      cancelled = true;
    };
  }, [selectedFriend?.id]);

  useEffect(() => {
    const cleanQuery = friendQuery.replace('@', '').trim();
    const instantResults = searchCachedBoaUsers(cleanQuery, currentUserId, 8)
      .filter((candidate) => !friends.some((friend) => friend.id === candidate.id));

    if (friendSearchTimeoutRef.current) clearTimeout(friendSearchTimeoutRef.current);

    if (friendQuery.trim().startsWith('@') || cleanQuery) {
      setFriendResults(instantResults);
    } else {
      setFriendResults([]);
    }

    if (!cleanQuery) {
      setSearchingUsers(false);
      return;
    }

    friendSearchTimeoutRef.current = setTimeout(async () => {
      setSearchingUsers(instantResults.length === 0);
      try {
        const results = await searchBoaUsers(cleanQuery, currentUserId, 8);
        setFriendResults(results.filter((candidate) => !friends.some((friend) => friend.id === candidate.id)));
      } catch {
        setFriendResults([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 140);

    return () => {
      if (friendSearchTimeoutRef.current) clearTimeout(friendSearchTimeoutRef.current);
    };
  }, [friendQuery, currentUserId, friends]);

  const cleanFriendQuery = friendQuery.replace('@', '').trim();
  const showCachedFriendSuggestions = cleanFriendQuery === '' && friendQuery.trim().startsWith('@') && friendResults.length > 0;

  const handleAddFriendClick = async (candidate: FoundBoaUser) => {
    setAddingFriendId(candidate.id);
    try {
      const added = await onAddFriend(candidate);
      if (added) {
        setFriendQuery('');
        setFriendResults([]);
        setSelectedFriendId(candidate.id);
      }
    } finally {
      setAddingFriendId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl w-full max-w-5xl max-h-[88vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#2a2a1a] flex items-center justify-center">
              <Users size={20} className="text-[#d0d0a0]" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">{tx('Amigos', 'Friends', 'Amigos', 'Amici')}</h3>
              <p className="text-xs text-gray-500">
                {tx(
                  'Veja o historico de amizades e as assinaturas publicas.',
                  'See your friend history and their public subscriptions.',
                  'Mira tu historial de amistades y sus suscripciones publicas.',
                  'Guarda la cronologia amici e gli abbonamenti pubblici.'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nfcSupported && (
              <button
                onClick={handleToggleNfcTab}
                title={tx('Adicionar por NFC', 'Add via NFC', 'Agregar por NFC', 'Aggiungi via NFC')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors border ${nfcTab ? 'bg-[#2a2a1a] border-[#5A5A40] text-[#d0d0a0]' : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:text-white'}`}
              >
                <Smartphone size={14} />
                NFC <span className="text-[9px] px-1 py-0.5 bg-amber-500/20 text-amber-400 rounded uppercase font-black">Beta</span>
              </button>
            )}
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#252525] flex items-center justify-center text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── NFC Tab ──────────────────────────────────────────────────── */}
        {nfcTab && nfcSupported && (
          <div className="border-b border-gray-800 bg-[#111] px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${nfcActive ? 'bg-[#2a2a1a] animate-pulse' : 'bg-[#222]'}`}>
                <Smartphone size={22} className={nfcActive ? 'text-[#d0d0a0]' : 'text-gray-500'} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">
                  {nfcActive
                    ? tx('Aproxime os celulares…', 'Bring phones close…', 'Acerca los teléfonos…', 'Avvicina i telefoni…')
                    : tx('Toque em Ativar NFC', 'Tap Enable NFC', 'Toca Activar NFC', 'Tocca Attiva NFC')}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {nfcActive
                    ? tx(
                        'Ambos precisam estar com esta aba aberta',
                        'Both need this tab open',
                        'Ambos deben tener esta pestaña abierta',
                        'Entrambi devono avere questa scheda aperta'
                      )
                    : tx(
                        'O Android pode pedir permissão só depois desse toque',
                        'Android may ask for permission only after this tap',
                        'Android puede pedir permiso solo después de este toque',
                        'Android potrebbe chiedere il permesso solo dopo questo tocco'
                      )}
                </p>
              </div>
              {nfcActive && (
                <div className="ml-auto flex gap-1">
                  {[0,1,2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#d0d0a0]"
                      style={{ animation: `ping 1.4s ease-in-out ${i * 0.3}s infinite` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {nfcError && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-xl px-3 py-2 mb-3">{nfcError}</p>
            )}

            {!nfcActive && (
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => void handleStartNfc()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] text-xs font-semibold hover:bg-[#333320] transition-colors"
                >
                  <Smartphone size={13} />
                  {nfcError
                    ? tx('Tentar novamente', 'Try again', 'Intentar de nuevo', 'Riprova')
                    : tx('Ativar NFC', 'Enable NFC', 'Activar NFC', 'Attiva NFC')}
                </button>
                <p className="text-[11px] text-gray-600">
                  {tx(
                    'Isso abre o pedido de acesso correto do Android',
                    'This triggers the proper Android access prompt',
                    'Esto abre el aviso correcto de acceso en Android',
                    'Questo apre la richiesta corretta di accesso su Android'
                  )}
                </p>
              </div>
            )}

            {nearbyUsers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
                  {tx('Encontrados por NFC', 'Found via NFC', 'Encontrados por NFC', 'Trovati via NFC')}
                </p>
                {nearbyUsers.map((nearby: NfcBoaProfile) => (
                  <div key={nearby.userId} className="flex items-center gap-3 bg-[#1a1a1a] border border-[#3a3a2a] rounded-2xl px-4 py-3">
                    <div className="w-10 h-10 rounded-full bg-[#2a2a1a] border border-[#5A5A40] flex items-center justify-center text-[#d0d0a0] font-bold shrink-0">
                      {(nearby.name || nearby.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{nearby.name || nearby.username}</p>
                      <p className="text-xs text-gray-500">@{nearby.username}</p>
                    </div>
                    <div className="flex gap-2">
                      {onShareSubscription && (
                        <button
                          type="button"
                          onClick={() => onShareSubscription({ id: nearby.userId, username: nearby.username, name: nearby.name })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#222] border border-gray-700 text-gray-300 text-xs font-semibold hover:border-[#5A5A40] hover:text-[#d0d0a0] transition-colors"
                        >
                          <Zap size={11} />
                          {tx('Compartilhar', 'Share', 'Compartir', 'Condividi')}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={addingNfcId === nearby.userId}
                        onClick={() => handleAddNfcFriend(nearby)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] text-xs font-semibold disabled:opacity-50 hover:bg-[#333320] transition-colors"
                      >
                        {addingNfcId === nearby.userId ? <RefreshCw size={12} className="animate-spin" /> : <UserPlus size={12} />}
                        {tx('Adicionar', 'Add', 'Agregar', 'Aggiungi')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : nfcActive ? (
              <p className="text-xs text-gray-600 text-center py-2">
                {tx('Nenhum usuário detectado ainda…', 'No user detected yet…', 'Ningún usuario detectado…', 'Nessun utente rilevato…')}
              </p>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] min-h-[560px] max-h-[calc(88vh-76px)]">
          <div className="border-r border-gray-800 overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-800 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                  {tx('Adicionar amigo', 'Add friend', 'Agregar amigo', 'Aggiungi amico')}
                </p>
                <div className="relative mt-3">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={friendQuery}
                    onChange={(event) => setFriendQuery(event.target.value)}
                    placeholder={tx('Buscar por @username', 'Search by @username', 'Buscar por @username', 'Cerca per @username')}
                    className="w-full bg-[#202020] border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#d0d0a0]/50"
                  />
                  {searchingUsers && (
                    <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                  )}
                </div>

                {(friendQuery.trim().startsWith('@') || cleanFriendQuery) && (
                  <div className="mt-2 bg-[#202020] border border-gray-800 rounded-2xl overflow-hidden">
                    {friendResults.length > 0 ? (
                      friendResults.map((candidate) => (
                        <div key={candidate.id} className="flex items-center gap-3 px-3 py-3 border-b border-gray-800 last:border-b-0">
                          <div className="w-9 h-9 rounded-full bg-[#111] border border-gray-700 flex items-center justify-center text-[#d0d0a0] font-bold shrink-0">
                            {(candidate.name || candidate.username).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm font-semibold truncate">{candidate.name || candidate.username}</p>
                            <p className="text-xs text-gray-500 truncate">@{candidate.username}</p>
                          </div>
                          <button
                            type="button"
                            disabled={addingFriendId === candidate.id}
                            onClick={() => handleAddFriendClick(candidate)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] text-xs font-semibold disabled:opacity-50"
                          >
                            {addingFriendId === candidate.id ? <RefreshCw size={13} className="animate-spin" /> : <UserPlus size={13} />}
                            {tx('Adicionar', 'Add', 'Agregar', 'Aggiungi')}
                          </button>
                        </div>
                      ))
                    ) : !searchingUsers && !showCachedFriendSuggestions ? (
                      <div className="px-3 py-3 text-xs text-red-400">
                        {tx('Usuario inexistente', 'User does not exist', 'Usuario inexistente', 'Utente inesistente')}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                {tx('Historico', 'History', 'Historial', 'Storico')}
              </p>
              </div>
            </div>

            {loading && friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                <RefreshCw size={20} className="animate-spin" />
                <p className="text-sm">{tx('Carregando amigos...', 'Loading friends...', 'Cargando amigos...', 'Caricamento amici...')}</p>
              </div>
            ) : friends.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#252525] flex items-center justify-center mx-auto mb-4">
                  <Users size={24} className="text-gray-600" />
                </div>
                <p className="text-white font-medium">{tx('Nenhum amigo ainda', 'No friends yet', 'Aun no tienes amigos', 'Nessun amico ancora')}</p>
                <p className="text-gray-500 text-sm mt-2">
                  {tx(
                    'Assim que voce compartilhar com alguem, a pessoa aparece aqui.',
                    'As soon as you share with someone, they will appear here.',
                    'En cuanto compartas con alguien, aparecera aqui.',
                    'Appena condividi con qualcuno, apparira qui.'
                  )}
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {friends.map((friend) => {
                  const isSelected = friend.id === selectedFriend?.id;
                  const label = friend.name || friend.username || 'Boa user';
                  const initial = label.charAt(0).toUpperCase();

                  return (
                    <button
                      key={friend.id}
                      onClick={() => setSelectedFriendId(friend.id)}
                      className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${isSelected ? 'bg-[#2a2a1a] border-[#5A5A40] shadow-lg shadow-[#000]/20' : 'bg-[#202020] border-gray-800 hover:border-gray-700'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-[#111] border border-gray-700 flex items-center justify-center text-[#d0d0a0] font-bold shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{label}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {friend.username ? `@${friend.username}` : tx('Usuario BoaWallet', 'BoaWallet user', 'Usuario BoaWallet', 'Utente BoaWallet')}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="overflow-y-auto">
            {!selectedFriend ? (
              <div className="h-full flex flex-col items-center justify-center px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#252525] flex items-center justify-center mb-4">
                  <Users size={28} className="text-gray-600" />
                </div>
                <p className="text-white font-medium">{tx('Selecione um amigo', 'Select a friend', 'Selecciona un amigo', 'Seleziona un amico')}</p>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-2xl font-bold text-white">{selectedFriend.name || selectedFriend.username || 'Boa user'}</h4>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] text-[10px] font-semibold uppercase tracking-wider">
                        <Globe size={11} /> {tx('Publico', 'Public', 'Publico', 'Pubblico')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedFriend.username ? `@${selectedFriend.username}` : tx('Sem @username', 'No @username', 'Sin @username', 'Senza @username')}
                    </p>
                  </div>
                </div>

                <div className="bg-[#111] border border-gray-800 rounded-3xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe size={16} className="text-[#d0d0a0]" />
                    <h5 className="text-white font-semibold">{tx('Assinaturas publicas', 'Public subscriptions', 'Suscripciones publicas', 'Abbonamenti pubblici')}</h5>
                  </div>

                  {loadingSubscriptions ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                      <RefreshCw size={18} className="animate-spin" />
                      <p className="text-sm">{tx('Carregando assinaturas...', 'Loading subscriptions...', 'Cargando suscripciones...', 'Caricamento abbonamenti...')}</p>
                    </div>
                  ) : publicSubscriptions.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-gray-800 flex items-center justify-center mx-auto mb-4">
                        <Lock size={22} className="text-gray-600" />
                      </div>
                      <p className="text-white font-medium">{tx('Usuario nao tem assinaturas publicas', 'User has no public subscriptions', 'El usuario no tiene suscripciones publicas', 'L utente non ha abbonamenti pubblici')}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {publicSubscriptions.map((subscription) => {
                        const logoUrl = bestLogoUrl(subscription.logoUrl, subscription.name);

                        return (
                          <div key={subscription.id} className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-[#252525] flex items-center justify-center overflow-hidden shrink-0">
                                {logoUrl ? (
                                  <img
                                    src={logoUrl}
                                    alt={subscription.name}
                                    className="w-full h-full object-contain bg-white p-1"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-xl">{subscription.emoji}</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-white font-semibold truncate">{subscription.name}</p>
                                <p className="text-xs text-gray-500 truncate">{subscription.category}</p>
                              </div>
                            </div>

                            <div className="mt-4 flex items-end justify-between gap-4">
                              <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider">{tx('Valor', 'Amount', 'Valor', 'Importo')}</p>
                                <p className="text-lg font-bold text-white">{formatCurrency(subscription.costAmount || 0, subscription.costCurrency)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-500 uppercase tracking-wider">{tx('Ciclo', 'Cycle', 'Ciclo', 'Ciclo')}</p>
                                <p className="text-sm text-[#d0d0a0]">{subscription.billingCycle === 'Yearly' ? tx('Anual', 'Yearly', 'Anual', 'Annuale') : tx('Mensal', 'Monthly', 'Mensual', 'Mensile')}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
