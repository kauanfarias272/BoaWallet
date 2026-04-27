import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bluetooth, Globe, Lock, RefreshCw, Search, Smartphone, UserPlus, Users, X, Zap } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { FriendProfile } from '../lib/friends';
import { Subscription } from '../types';
import { bestLogoUrl } from '../lib/logos';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../supabase';
import { withTimeout } from '../lib/requestTimeout';
import { FoundBoaUser, searchBoaUsers, searchCachedBoaUsers } from '../lib/userSearch';
import { App as CapApp } from '@capacitor/app';
import {
  BoaPeerProfile,
  clearNfcProfileBroadcast,
  getNfcStatus,
  isNfcSupported,
  prepareNfcProfileBroadcast,
  startNfcScan,
  NfcScanHandle,
} from '../lib/nfc';
import {
  getNearbyStatus,
  isNearbySupported,
  startNearbySession,
  NearbySessionHandle,
} from '../lib/nearbyPeople';

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
  const [nearbyTab, setNearbyTab] = useState(false);
  const nearbySupported = isNearbySupported();
  const [nearbyActive, setNearbyActive] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  const [nearbyPeople, setNearbyPeople] = useState<BoaPeerProfile[]>([]);
  const [nearbyAvailable, setNearbyAvailable] = useState<boolean | null>(null);
  const [nearbyPermissionsOk, setNearbyPermissionsOk] = useState<boolean | null>(null);
  const [nearbyNeedsLocation, setNearbyNeedsLocation] = useState(false);
  const nearbySessionHandleRef = useRef<NearbySessionHandle | null>(null);

  const [nfcTab, setNfcTab] = useState(false);
  const nfcSupported = isNfcSupported();
  const [nfcActive, setNfcActive] = useState(false);
  const [nfcError, setNfcError] = useState('');
  const [nfcUsers, setNfcUsers] = useState<BoaPeerProfile[]>([]);
  const [addingNfcId, setAddingNfcId] = useState<string | null>(null);
  const nfcScanHandleRef = useRef<NfcScanHandle | null>(null);
  const [nfcEnabled, setNfcEnabled] = useState<boolean | null>(null);
  const [nfcBroadcastReady, setNfcBroadcastReady] = useState(false);

  const tx = (pt: string, en: string, es: string, it: string) =>
    ({ pt, en, es, it }[language] ?? en);

  const hasNearbyProfile = !!currentUsername?.trim();

  const refreshNativeStatus = async () => {
    if (nfcSupported) {
      try {
        const status = await getNfcStatus();
        setNfcEnabled(status.enabled);
        setNfcBroadcastReady(status.hasPayload);
      } catch {
        setNfcEnabled(false);
        setNfcBroadcastReady(false);
      }
    }

    if (nearbySupported) {
      try {
        const status = await getNearbyStatus();
        setNearbyAvailable(status.available);
        setNearbyPermissionsOk(status.permissionsOk);
        setNearbyNeedsLocation(status.needsLocation);
      } catch {
        setNearbyAvailable(false);
        setNearbyPermissionsOk(false);
        setNearbyNeedsLocation(false);
      }
    }
  };

  const stopNearbySession = () => {
    const activeHandle = nearbySessionHandleRef.current;
    if (activeHandle) {
      activeHandle.stop();
      nearbySessionHandleRef.current = null;
    }
    setNearbyActive(false);
  };

  const stopNfcScan = () => {
    const activeHandle = nfcScanHandleRef.current;
    if (activeHandle) {
      activeHandle.stop();
      nfcScanHandleRef.current = null;
    }
    setNfcActive(false);
  };

  const handleNearbyProfileRead = (profile: BoaPeerProfile) => {
    if (profile.userId === currentUserId) return;

    setNearbyPeople((prev: BoaPeerProfile[]) => {
      if (prev.some((u: BoaPeerProfile) => u.userId === profile.userId)) return prev;
      return [profile, ...prev];
    });
  };

  const handleNfcProfileRead = (profile: BoaPeerProfile) => {
    if (profile.userId === currentUserId) return;

    setNfcUsers((prev: BoaPeerProfile[]) => {
      if (prev.some((u: BoaPeerProfile) => u.userId === profile.userId)) return prev;
      return [profile, ...prev];
    });
  };

  const handleNearbyStartError = (err: Error) => {
    const msg = err.message.toLowerCase();
    const isPermissionDenied =
      msg.includes('permission') ||
      msg.includes('denied') ||
      msg.includes('bluetooth_scan') ||
      msg.includes('bluetooth_connect') ||
      msg.includes('bluetooth_advertise');
    const needsPlayServices =
      msg.includes('play services') ||
      msg.includes('google play');

    if (isPermissionDenied) {
      setNearbyError(tx(
        'O Android negou o acesso de proximidade. Ao abrir a busca, permita Bluetooth e localizacao se o sistema pedir.',
        'Android denied nearby access. When search opens, allow Bluetooth and location if the system asks.',
        'Android nego el acceso de proximidad. Al abrir la busqueda, permite Bluetooth y ubicacion si el sistema lo pide.',
        'Android ha negato l accesso di prossimita. Quando apri la ricerca, consenti Bluetooth e posizione se il sistema lo chiede.'
      ));
      void refreshNativeStatus();
      return;
    }

    if (needsPlayServices) {
      setNearbyError(tx(
        'O Google Play Services nao esta pronto neste aparelho, entao a busca por perto nao pode iniciar.',
        'Google Play services is not ready on this device, so nearby search cannot start.',
        'Google Play services no esta listo en este dispositivo, asi que la busqueda cercana no puede iniciar.',
        'Google Play Services non e pronto su questo dispositivo, quindi la ricerca vicina non puo iniziare.'
      ));
      void refreshNativeStatus();
      return;
    }

    setNearbyError(
      tx(
        'Nao foi possivel procurar pessoas por Bluetooth',
        'Could not search for people over Bluetooth',
        'No se pudo buscar personas por Bluetooth',
        'Impossibile cercare persone via Bluetooth'
      ) + ': ' + (err.message || 'unknown')
    );
    void refreshNativeStatus();
  };

  const handleNfcStartError = (err: Error) => {
    const msg = err.message.toLowerCase();
    const isDisabled =
      msg.includes('disabled') ||
      msg.includes('not enabled') ||
      msg.includes('nfc is disabled') ||
      msg.includes('nfc_disabled');

    if (isDisabled) {
      setNfcError(tx(
        'O NFC nativo esta desligado no Android. Ligue o NFC do telefone e tente de novo.',
        'Native NFC is turned off on Android. Turn on NFC on the phone and try again.',
        'El NFC nativo esta apagado en Android. Activa el NFC del telefono y prueba otra vez.',
        'Il NFC nativo e disattivato su Android. Attiva l NFC del telefono e riprova.'
      ));
      return;
    }

    setNfcError(tx(
      'Nao foi possivel ler o perfil por NFC',
      'Could not read the profile over NFC',
      'No se pudo leer el perfil por NFC',
      'Impossibile leggere il profilo via NFC'
    ) + ': ' + (err.message || 'unknown'));
  };

  const handleStartNearby = async () => {
    if (!nearbySupported || !hasNearbyProfile || !currentUsername) return;

    stopNearbySession();
    setNearbyError('');

    try {
      const handle = await startNearbySession(
        {
          userId: currentUserId,
          username: currentUsername.trim().toLowerCase(),
          name: currentName,
        },
        handleNearbyProfileRead,
        handleNearbyStartError
      );

      nearbySessionHandleRef.current = handle;
      setNearbyActive(true);
      await refreshNativeStatus();
    } catch (err) {
      handleNearbyStartError(err as Error);
    }
  };

  const handleStartNfc = async () => {
    if (!nfcSupported) return;

    stopNfcScan();
    setNfcError('');

    try {
      const handle = await startNfcScan(
        handleNfcProfileRead,
        handleNfcStartError
      );

      nfcScanHandleRef.current = handle;
      setNfcActive(true);
      await refreshNativeStatus();
    } catch (err) {
      handleNfcStartError(err as Error);
    }
  };

  const handleToggleNearbyTab = () => {
    if (nearbyTab) {
      stopNearbySession();
      setNearbyError('');
      setNearbyTab(false);
      return;
    }

    stopNfcScan();
    setNfcError('');
    setNearbyPeople([]);
    setNearbyTab(true);
    setNfcTab(false);
  };

  const handleToggleNfcTab = () => {
    if (nfcTab) {
      stopNfcScan();
      setNfcError('');
      setNfcTab(false);
      return;
    }

    stopNearbySession();
    setNearbyError('');
    setNfcUsers([]);
    setNfcError('');
    setNfcTab(true);
    setNearbyTab(false);
  };

  useEffect(() => {
    void refreshNativeStatus();
  }, []);

  useEffect(() => {
    if (!nfcSupported) return;

    if (!hasNearbyProfile || !currentUsername) {
      void clearNfcProfileBroadcast().finally(() => void refreshNativeStatus());
      return;
    }

    void prepareNfcProfileBroadcast({
      userId: currentUserId,
      username: currentUsername.trim().toLowerCase(),
      name: currentName,
    })
      .then(() => void refreshNativeStatus())
      .catch((err: Error) => handleNfcStartError(err));

    return () => {
      void clearNfcProfileBroadcast();
    };
  }, [currentName, currentUserId, currentUsername, hasNearbyProfile, nfcSupported]);

  useEffect(() => {
    return () => {
      stopNearbySession();
      const activeHandle = nfcScanHandleRef.current;
      if (activeHandle) {
        activeHandle.stop();
        nfcScanHandleRef.current = null;
      }
    };
  }, []);

  // Android back button: fecha painel BT/NFC aberto ou o modal inteiro
  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', () => {
      if (nearbyTab) {
        handleToggleNearbyTab();
      } else if (nfcTab) {
        handleToggleNfcTab();
      } else {
        onClose();
      }
    });
    return () => { listenerPromise.then((l) => l.remove()); };
  }, [nearbyTab, nfcTab]);

  // â”€â”€ NFC lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    return;

    let handle: NfcScanHandle | null = null;
    setNfcActive(false);
    setNfcError('');

    startNfcScan(
      (profile) => {
        if (profile.userId === currentUserId) return; // ignora o prÃ³prio usuÃ¡rio
        setNfcUsers((prev: BoaPeerProfile[]) => {
          if (prev.some((u: BoaPeerProfile) => u.userId === profile.userId)) return prev;
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
            'O NFC nativo esta desligado no Android. Ligue o NFC do telefone e tente de novo.',
            'Native NFC is turned off on Android. Turn on NFC on the phone and try again.',
            'El NFC nativo esta apagado en Android. Activa el NFC del telefono y prueba otra vez.',
            'Il NFC nativo e disattivato su Android. Attiva l NFC del telefono e riprova.'
          ));
        } else if (isWebViewLimit) {
          setNfcError(tx(
            'Este fluxo agora usa NFC nativo do Android dentro do app.',
            'This flow now uses native Android NFC inside the app.',
            'Este flujo ahora usa NFC nativo de Android dentro de la app.',
            'Questo flusso ora usa il NFC nativo di Android dentro l app.'
          ));
        } else if (isDisabled) {
          setNfcError(tx(
            'NFC desabilitado ou nÃ£o suportado neste dispositivo.',
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

  const handleAddNfcFriend = async (profile: BoaPeerProfile) => {
    setAddingNfcId(profile.userId);
    const candidate: FoundBoaUser = {
      id: profile.userId,
      username: profile.username,
      name: profile.name,
    };
    try {
      await onAddFriend(candidate);
      setNfcUsers((prev: BoaPeerProfile[]) => prev.filter((u: BoaPeerProfile) => u.userId !== profile.userId));
    } finally {
      setAddingNfcId(null);
    }
  };
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            {nearbySupported && (
              <button
                onClick={handleToggleNearbyTab}
                title={tx('Adicionar por Bluetooth', 'Add via Bluetooth', 'Agregar por Bluetooth', 'Aggiungi via Bluetooth')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors border ${nearbyTab ? 'bg-sky-500/12 border-sky-300/30 text-sky-100' : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:text-white'}`}
              >
                <Bluetooth size={14} />
                Bluetooth
              </button>
            )}
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

        {/* â”€â”€ NFC Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {nearbyTab && nearbySupported && (
          <div className="border-b border-gray-800 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.16),transparent_38%),linear-gradient(160deg,#10141c_0%,#0d1118_55%,#0b0d12_100%)] px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-sky-200/70 font-semibold">
                {tx('Bluetooth â€” pessoas por perto', 'Bluetooth â€” nearby people', 'Bluetooth â€” personas cercanas', 'Bluetooth â€” persone vicine')}
              </p>
              <button
                onClick={handleToggleNearbyTab}
                className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white"
                title={tx('Fechar', 'Close', 'Cerrar', 'Chiudi')}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col lg:flex-row lg:items-center gap-5 mb-5">
              <div className="flex-1 flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-full shrink-0">
                  <div className="absolute inset-0 rounded-full bg-sky-400/20 blur-2xl" />
                  <div className={`absolute inset-2 rounded-full border ${nearbyActive ? 'border-sky-300/35 animate-pulse' : 'border-white/10'}`} />
                  <div className="absolute inset-[1.15rem] rounded-full bg-white/8 border border-white/10 flex items-center justify-center">
                    <Bluetooth size={24} className={nearbyActive ? 'text-sky-200' : 'text-gray-400'} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-sky-200/70 font-semibold mb-2">
                    {tx('Proximidade premium', 'Premium proximity', 'Proximidad premium', 'Prossimita premium')}
                  </p>
                  <p className="text-white font-semibold text-lg">
                    {tx(
                      'Encontre pessoas por Bluetooth como um AirDrop do BoaWallet',
                      'Find nearby people over Bluetooth like a BoaWallet AirDrop',
                      'Encuentra personas por Bluetooth como un AirDrop de BoaWallet',
                      'Trova persone via Bluetooth come un AirDrop di BoaWallet'
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {tx(
                      'Mantenha o app aberto nos dois celulares para aparecer aqui.',
                      'Keep the app open on both phones to appear here.',
                      'Mantiene la app abierta en ambos telefonos para aparecer aqui.',
                      'Tieni l app aperta su entrambi i telefoni per apparire qui.'
                    )}
                  </p>
                </div>
              </div>

              <div className="lg:w-[310px] rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                {!hasNearbyProfile ? (
                  <p className="text-sm text-amber-200/90">
                    {tx(
                      'Defina um @username no app para poder aparecer para outras pessoas por perto.',
                      'Set a @username in the app so nearby people can find you.',
                      'Define un @username en la app para que otros te encuentren cerca.',
                      'Imposta un @username nell app per farti trovare dalle persone vicine.'
                    )}
                  </p>
                ) : (
                  <>
                    <p className="text-white text-sm font-semibold">
                      {nearbyActive
                        ? tx('Bluetooth ativo', 'Bluetooth scanning', 'Bluetooth activo', 'Bluetooth attivo')
                        : tx('Buscar pessoas por perto', 'Search nearby people', 'Buscar personas cercanas', 'Cerca persone vicine')}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {tx(
                        'Funciona melhor que o fluxo antigo de celular com celular via NFC.',
                        'Works better than the old phone-to-phone NFC flow.',
                        'Funciona mejor que el flujo antiguo telefono con telefono por NFC.',
                        'Funziona meglio del vecchio flusso telefono-telefono via NFC.'
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className={`px-2.5 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.22em] border ${
                        nearbyAvailable === null
                          ? 'bg-white/5 border-white/10 text-gray-300'
                          : nearbyAvailable === false
                            ? 'bg-red-500/10 border-red-400/20 text-red-200'
                            : 'bg-sky-500/10 border-sky-300/20 text-sky-100'
                      }`}>
                        {nearbyAvailable === null
                          ? tx('Verificando', 'Checking', 'Verificando', 'Verifica')
                          : nearbyAvailable === false
                            ? tx('Servicos indisponiveis', 'Services unavailable', 'Servicios no disponibles', 'Servizi non disponibili')
                            : tx('Bluetooth pronto', 'Bluetooth ready', 'Bluetooth listo', 'Bluetooth pronto')}
                      </span>
                      <span className={`px-2.5 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.22em] border ${
                        nearbyPermissionsOk === null
                          ? 'bg-white/5 border-white/10 text-gray-300'
                          : nearbyPermissionsOk
                            ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'
                            : 'bg-white/5 border-white/10 text-gray-300'
                      }`}>
                        {nearbyPermissionsOk === null
                          ? tx('Aguardando', 'Waiting', 'Esperando', 'In attesa')
                          : nearbyPermissionsOk
                            ? tx('Acesso liberado', 'Access granted', 'Acceso concedido', 'Accesso consentito')
                            : tx('Permissao ao abrir', 'Allow on prompt', 'Permitir al abrir', 'Consenti all avvio')}
                      </span>
                    </div>
                    {nearbyPermissionsOk === false && (
                      <p className="text-[11px] text-gray-400 mt-3">
                        {nearbyNeedsLocation
                          ? tx(
                              'No Android mais antigo, o sistema tambem pode pedir localizacao para achar pessoas por perto.',
                              'On older Android, the system may also ask for location to find nearby people.',
                              'En Android antiguo, el sistema tambien puede pedir ubicacion para encontrar personas cercanas.',
                              'Su Android meno recente, il sistema puo anche chiedere la posizione per trovare persone vicine.'
                            )
                          : tx(
                              'Ao tocar em Buscar agora, permita acesso Bluetooth quando o Android pedir.',
                              'When you tap Start search, allow Bluetooth access when Android asks.',
                              'Al tocar Buscar ahora, permite el acceso Bluetooth cuando Android lo pida.',
                              'Quando tocchi Avvia ricerca, consenti l accesso Bluetooth quando Android lo chiede.'
                            )}
                      </p>
                    )}
                    <div className="flex gap-2 mt-4">
                      {!nearbyActive ? (
                        <button
                          type="button"
                          onClick={() => void handleStartNearby()}
                          disabled={!hasNearbyProfile || nearbyAvailable === false}
                          className="flex-1 px-4 py-3 rounded-2xl bg-[#d0d0a0] text-[#0a0a0a] text-sm font-semibold disabled:opacity-40"
                        >
                          {tx('Buscar agora', 'Start search', 'Buscar ahora', 'Avvia ricerca')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopNearbySession}
                          className="flex-1 px-4 py-3 rounded-2xl bg-white/8 border border-white/10 text-white text-sm font-semibold"
                        >
                          {tx('Parar busca', 'Stop search', 'Detener busqueda', 'Ferma ricerca')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {nearbyError && (
              <p className="text-xs text-red-300 bg-red-900/20 border border-red-800/40 rounded-2xl px-3 py-2 mb-4">{nearbyError}</p>
            )}

            {nearbyPeople.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {nearbyPeople.map((nearby: BoaPeerProfile) => (
                  <div key={nearby.userId} className="relative overflow-hidden flex items-center gap-3 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] border border-white/10 rounded-[1.6rem] px-4 py-4 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.18),transparent_34%)]" />
                    <div className="relative w-11 h-11 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center text-white font-bold shrink-0">
                      {(nearby.name || nearby.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{nearby.name || nearby.username}</p>
                      <p className="text-xs text-sky-100/70 truncate">@{nearby.username}</p>
                    </div>
                    <div className="relative flex gap-2">
                      {onShareSubscription && (
                        <button
                          type="button"
                          onClick={() => onShareSubscription({ id: nearby.userId, username: nearby.username, name: nearby.name })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/8 border border-white/10 text-white text-xs font-semibold"
                        >
                          <Zap size={11} />
                          {tx('Assinatura', 'Share plan', 'Compartir plan', 'Condividi piano')}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={addingNfcId === nearby.userId}
                        onClick={() => handleAddNfcFriend(nearby)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#d0d0a0] text-[#0a0a0a] text-xs font-semibold disabled:opacity-50"
                      >
                        {addingNfcId === nearby.userId ? <RefreshCw size={12} className="animate-spin" /> : <UserPlus size={12} />}
                        {tx('Adicionar', 'Add', 'Agregar', 'Aggiungi')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-white/6 border border-white/8 flex items-center justify-center mb-4">
                  {nearbyActive ? <RefreshCw size={22} className="text-sky-200 animate-spin" /> : <Bluetooth size={22} className="text-gray-500" />}
                </div>
                <p className="text-white font-medium">
                  {nearbyActive
                    ? tx('Procurando pessoas por perto...', 'Scanning for nearby people...', 'Buscando personas cercanas...', 'Ricerca persone vicine...')
                    : tx('Nenhuma pessoa encontrada ainda', 'No nearby person found yet', 'Ninguna persona encontrada aun', 'Nessuna persona trovata')}
                </p>
              </div>
            )}
          </div>
        )}

        {nfcTab && nfcSupported && (
          <div className="border-b border-gray-800 bg-[#111] px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#d0d0a0]/70 font-semibold">
                NFC Beta
              </p>
              <button
                onClick={handleToggleNfcTab}
                className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white"
                title={tx('Fechar', 'Close', 'Cerrar', 'Chiudi')}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${nfcActive ? 'bg-[#2a2a1a] animate-pulse' : 'bg-[#222]'}`}>
                <Smartphone size={22} className={nfcActive ? 'text-[#d0d0a0]' : 'text-gray-500'} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">
                  {nfcActive
                    ? tx('Aproxime os celulares para ler o perfil', 'Bring the phones together to read the profile', 'Acerca los telefonos para leer el perfil', 'Avvicina i telefoni per leggere il profilo')
                    : tx('Modo nativo: um celular le, o outro anuncia', 'Native mode: one phone reads, the other announces', 'Modo nativo: un telefono lee, el otro anuncia', 'Modo nativo: un telefono legge, l altro annuncia')}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {nfcActive
                    ? tx(
                        'Deixe o outro aparelho com o app aberto e aproxime os dois',
                        'Keep the other device with the app open and bring both phones together',
                        'Deja el otro dispositivo con la app abierta y acerca ambos telefonos',
                        'Tieni l altro dispositivo con l app aperta e avvicina i due telefoni'
                      )
                    : tx(
                        'Esse fluxo nao depende mais do Web NFC da WebView',
                        'This flow no longer depends on Web NFC inside the WebView',
                        'Este flujo ya no depende del Web NFC dentro de la WebView',
                        'Questo flusso non dipende piu dal Web NFC dentro la WebView'
                      )}
                </p>
              </div>
              {nfcActive && (
                <div className="ml-auto flex gap-1">
                  {[0,1,2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#d0d0a0] animate-ping"
                      style={{ animationDelay: `${i * 0.3}s` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {nfcError && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-xl px-3 py-2 mb-3">{nfcError}</p>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`px-2.5 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.22em] border ${
                nfcEnabled === null
                  ? 'bg-white/5 border-white/10 text-gray-300'
                  : nfcEnabled
                    ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'
                    : 'bg-red-500/10 border-red-400/20 text-red-200'
              }`}>
                {nfcEnabled === null
                  ? tx('Verificando NFC', 'Checking NFC', 'Verificando NFC', 'Verifica NFC')
                  : nfcEnabled
                    ? tx('NFC ligado', 'NFC enabled', 'NFC activo', 'NFC attivo')
                    : tx('NFC desligado', 'NFC disabled', 'NFC apagado', 'NFC disattivato')}
              </span>
              <span className={`px-2.5 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.22em] border ${nfcBroadcastReady ? 'bg-[#d0d0a0]/10 border-[#d0d0a0]/25 text-[#e8e8c0]' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                {nfcBroadcastReady ? tx('Perfil pronto', 'Profile ready', 'Perfil listo', 'Profilo pronto') : tx('Sem perfil anunciado', 'No profile announced', 'Sin perfil anunciado', 'Nessun profilo annunciato')}
              </span>
            </div>

            {!nfcBroadcastReady && hasNearbyProfile && (
              <p className="text-[11px] text-gray-500 mb-4">
                {tx(
                  'Abra esta tela no outro aparelho por alguns segundos para ele anunciar seu perfil nativo por NFC.',
                  'Open this screen on the other device for a few seconds so it can announce its native NFC profile.',
                  'Abre esta pantalla en el otro dispositivo unos segundos para que anuncie su perfil nativo por NFC.',
                  'Apri questa schermata sull altro dispositivo per qualche secondo cosi puo annunciare il suo profilo NFC nativo.'
                )}
              </p>
            )}

            {!hasNearbyProfile && (
              <p className="text-[11px] text-amber-200/80 mb-4">
                {tx(
                  'Defina um @username para que outro celular consiga ler seu perfil por NFC.',
                  'Set a @username so another phone can read your profile over NFC.',
                  'Define un @username para que otro telefono pueda leer tu perfil por NFC.',
                  'Imposta un @username cosi un altro telefono puo leggere il tuo profilo via NFC.'
                )}
              </p>
            )}

            {!nfcActive && (
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => void handleStartNfc()}
                  disabled={nfcEnabled === false}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2a2a1a] border border-[#5A5A40] text-[#d0d0a0] text-xs font-semibold hover:bg-[#333320] transition-colors disabled:opacity-40"
                >
                  <Smartphone size={13} />
                  {nfcError
                    ? tx('Tentar novamente', 'Try again', 'Intentar de nuevo', 'Riprova')
                    : tx('Ler por NFC', 'Read via NFC', 'Leer por NFC', 'Leggi via NFC')}
                </button>
                <p className="text-[11px] text-gray-600">
                  {tx(
                    'Um telefone fica pronto para toque. O outro entra em modo leitor.',
                    'One phone stays ready for tap. The other enters reader mode.',
                    'Un telefono queda listo para tocar. El otro entra en modo lector.',
                    'Un telefono resta pronto al tocco. L altro entra in modalita lettore.'
                  )}
                </p>
              </div>
            )}

            {nfcUsers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
                  {tx('Encontrados por NFC', 'Found via NFC', 'Encontrados por NFC', 'Trovati via NFC')}
                </p>
                {nfcUsers.map((nearby: BoaPeerProfile) => (
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
                          {tx('Assinatura', 'Share plan', 'Compartir plan', 'Condividi piano')}
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
                {tx('Nenhum usuario detectado ainda...', 'No user detected yet...', 'Ningun usuario detectado aun...', 'Nessun utente rilevato ancora...')}
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

