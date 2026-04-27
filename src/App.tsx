import React, { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { SubscriptionList } from './components/SubscriptionList';
import { SubscriptionForm } from './components/SubscriptionForm';
import { WelcomeModal } from './components/WelcomeModal';
import { Cashflow } from './components/Cashflow';
import { ClientsTab } from './components/ClientsTab';
import { ShareModal } from './components/ShareModal';
import { SharedWithMeTab } from './components/SharedWithMeTab';
import { FriendsModal } from './components/FriendsModal';
// LightningWallet removed — Bitcoin wallet login was removed from the app
import { PublicMarketplaceModal } from './components/PublicMarketplaceModal';

import { Currency, Subscription, Adjustment, getEffectiveTotalCost, convertCurrency, SharedMember, BillingCycle } from './types';
import { Plus, AlertTriangle, LogOut, Download, Upload, FileText, DollarSign, Database, Settings, Users, Globe } from 'lucide-react';
import { useAppContext } from './AppContext';
import { useTranslation, Language } from './i18n';
import { supabase } from './supabase';
import { db, auth as firebaseAuth } from './firebase';
import { collection, query, where, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clearPersistedTokens } from './lib/durableSession';
import { addToSyncQueue, removeFromSyncQueue, getDueItems, markRetried } from './lib/syncQueue';
import { formatCurrency } from './lib/utils';
import { normalizeLogoUrl } from './lib/logos';
import { sortFriendPair, FriendshipRow, FriendProfile, readFriendsCache, writeFriendsCache } from './lib/friends';
import { findSharedMemberForUser, normalizeSharedMember, resolveSharedMemberAmount, withSharedMemberPaymentStatus } from './lib/sharedMembers';
import { claimPendingTransfers, processRecurringMemberships, releaseDueSubscriptionEscrows } from './lib/platformPayments';
import { hydrateUserSearchCache, prefetchBoaUsers } from './lib/userSearch';
import { withTimeout } from './lib/requestTimeout';
import { embedCredentialsInNotes, stripCredentialsFromNotes } from './lib/serviceCredentials';
import { syncToWatch } from './lib/wearSync';

/** Firebase rejects objects with `undefined` values — strip them before setDoc */
function sanitizeForFirebase(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sanitizeForFirebase);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, sanitizeForFirebase(v)])
    );
  }
  return obj;
}

const LANG_OPTIONS = [
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'pt', label: 'PT', flag: '🇧🇷' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'it', label: 'IT', flag: '🇮🇹' }
];

const CURRENCIES: Currency[] = ['BRL','USD','EUR','GBP','JPY','TRY','ARS','INR','IDR','CAD','AUD','CHF','CNY','MXN','BTC','SATS'];
const NATIVE_OAUTH_CALLBACK = 'io.boa.wallet://auth';
const PUBLIC_OAUTH_CALLBACK = 'https://kauanfarias272.github.io/BoaWallet/auth/';
const OAUTH_CALLBACK_PREFIXES = [
  NATIVE_OAUTH_CALLBACK,
  `${NATIVE_OAUTH_CALLBACK}/`,
  PUBLIC_OAUTH_CALLBACK,
  PUBLIC_OAUTH_CALLBACK.replace(/\/$/, ''),
  'https://boawallet.app/auth/',
  'https://boawallet.app/auth',
  // Also match Supabase's own callback URL which may contain the code after PKCE exchange
  'https://xrnfgdyqkqqpxjwpmkta.supabase.co/auth/v1/callback',
];

function isOAuthCallbackUrl(url: string) {
  const normalized = url.trim().toLowerCase();
  return OAUTH_CALLBACK_PREFIXES.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

function normalizeOAuthCallbackUrl(url: string) {
  const trimmed = url.trim();
  if (trimmed.toLowerCase().startsWith(NATIVE_OAUTH_CALLBACK.toLowerCase())) {
    return trimmed.replace(/^io\.boa\.wallet:\/\/auth\/?/i, PUBLIC_OAUTH_CALLBACK);
  }

  return trimmed;
}

function UserAvatar({ user, onClick }: { user: import('@supabase/supabase-js').User; onClick: () => void }) {
  const [imgError, setImgError] = React.useState(false);
  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        onClick={onClick}
        onError={() => setImgError(true)}
        className="w-10 h-10 rounded-full border border-gray-800 cursor-pointer object-cover"
        alt="User"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div onClick={onClick} className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold cursor-pointer">
      {(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

export default function App() {
  const { language, setLanguage, theme, setTheme, exchangeRates, userName, setUserName, gender, setGender, user, authLoading, setGoogleAccessToken, userHandle, saveUserHandle } = useAppContext();
  const t = useTranslation(language);

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'cashflow' | 'calendar' | 'clients' | 'shared'>('overview');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [receivedSubscriptions, setReceivedSubscriptions] = useState<Subscription[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | undefined>();
  const [subToDelete, setSubToDelete] = useState<string | null>(null);
  const [disablePromptSub, setDisablePromptSub] = useState<Subscription | null>(null);
  const [renewalPromptSub, setRenewalPromptSub] = useState<Subscription | null>(null);
  const [disableType, setDisableType] = useState<'permanent' | 'temporary' | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<Currency>(() => (localStorage.getItem('baseCurrency') as Currency) || 'BRL');
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showMarketplaceModal, setShowMarketplaceModal] = useState(false);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const secretTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'google' | 'web3' | null>(null);
  // Bitcoin login has been removed — the feature required too much manual config for users
  const [welcomeSkipped, setWelcomeSkipped] = useState(() => localStorage.getItem('boa_welcome_skipped') === '1');
  const [syncLoading, setSyncLoading] = useState(false);
  const [shareSub, setShareSub] = useState<Subscription | null>(null);
  const [sharePreUser, setSharePreUser] = useState<{ id: string; name?: string; username: string } | null>(null);
  const [shareTargetUser, setShareTargetUser] = useState<{ id: string; name?: string; username: string } | null>(null);
  const [pendingHandle, setPendingHandle] = useState('');
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleError, setHandleError] = useState('');
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [importDuplicates, setImportDuplicates] = useState<{ duplicates: Subscription[]; newItems: Subscription[]; adjustments: Adjustment[]; selected: Set<string> } | null>(null);

  type SubscriptionMemberRow = {
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
    last_paid_at?: string;
    next_payment_due_at?: string;
    pending_release_until?: string;
    latest_payment_event_id?: string;
    public_join?: boolean;
  };

  const showToast = (msg: string, ok = true) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ msg, ok });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  // Inline multilingual helper — avoids touching i18n for small UX strings
  const m = (pt: string, en: string, es: string, it: string) =>
    ({ pt, en, es, it }[language as 'pt'|'en'|'es'|'it'] ?? en);

  const tabMeta = [
    { id: 'overview', label: m('Visao geral', 'Overview', 'Resumen', 'Panoramica'), accent: false },
    { id: 'cashflow', label: m('Fluxo', 'Cashflow', 'Flujo', 'Flusso'), accent: false },
    { id: 'calendar', label: m('Calendario', 'Calendar', 'Calendario', 'Calendario'), accent: false },
    { id: 'clients', label: m('Clientes', 'Clients', 'Clientes', 'Clienti'), accent: false },
    { id: 'shared', label: m('Compartilhado', 'Shared', 'Compartido', 'Condiviso'), accent: false },
    { id: 'history', label: m('Historico', 'History', 'Historial', 'Storico'), accent: false },
  ] as const;

  const isNativePlatform = Capacitor.getPlatform() !== 'web';
  const canUseWeb3Login = !isNativePlatform && typeof window !== 'undefined' && !!((window as any).ethereum || (window as any).solana);

  useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('baseCurrency', baseCurrency); }, [baseCurrency]);

  // Tracks whether a deep link was received so browserFinished doesn't duplicate the toast
  const oauthHandledRef = useRef(false);

  const showLoginSuccessToast = () =>
    showToast(m('Login realizado!', 'Logged in!', 'Sesion iniciada!', 'Accesso effettuato!'), true);

  const showLoginFailureToast = () =>
    showToast(m('Erro ao fazer login. Tente novamente.', 'Login failed. Please try again.', 'Error al iniciar sesiÃ³n. IntÃ©ntalo de nuevo.', 'Errore di accesso. Riprova.'), false);

  const getSessionSafely = async () => {
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    return session;
  };

  const closeOauthBrowser = async () => {
    try {
      await Browser.close();
    } catch {
      // browser may already be gone
    }
  };

  // Handle OAuth callback from the native deep link or hosted bridge page
  const handleOAuthUrl = async (url: string) => {
    if (!isOAuthCallbackUrl(url)) return false;
    oauthHandledRef.current = true;
    console.log('[BoaWallet] Handling OAuth callback:', url);
    await closeOauthBrowser();
    try {
      // Normalize custom scheme → https so URL parsing is reliable in all JS environments
      const normalizedUrl = normalizeOAuthCallbackUrl(url);
      const hasError = /(?:\?|&|#)error=/.test(normalizedUrl);
      const hasCode = /(?:\?|&|#)code=/.test(normalizedUrl);

      if (hasError) {
        console.warn('[BoaWallet] OAuth callback contains an error:', normalizedUrl);
        const fallbackSession = await getSessionSafely();
        if (fallbackSession) {
          showLoginSuccessToast();
        } else {
          showLoginFailureToast();
        }
        return true;
      }

      if (!hasCode) {
        const existingSession = await getSessionSafely();
        if (existingSession) {
          console.log('[BoaWallet] Existing session found without code exchange.');
          showLoginSuccessToast();
        } else {
          console.warn('[BoaWallet] OAuth callback arrived without code and without session.');
        }
        return true;
      }

      // Retry code exchange a few times for network/timing issues
      let exchangeSession: any = null;
      let lastError: any = null;
      const MAX_RETRIES = 4;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(normalizedUrl);
          if (!error && data?.session) {
            exchangeSession = data.session;
            break;
          }
          lastError = error;
          // Don't retry if code was already consumed
          if (error?.message?.includes('invalid_grant') || error?.message?.includes('already')) break;
          if (attempt < MAX_RETRIES) {
            console.warn(`[BoaWallet] Code exchange attempt ${attempt} failed, retrying...`, error?.message);
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        } catch (e) {
          lastError = e;
          if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }

      if (exchangeSession) {
        console.log('[BoaWallet] OAuth session established:', exchangeSession.user.email);
        showLoginSuccessToast();
      } else {
        console.warn('[BoaWallet] Code exchange failed after retries, checking existing session...', lastError?.message || lastError);
        const fallbackSession = await getSessionSafely();
        if (fallbackSession) {
          console.log('[BoaWallet] Fallback session found.');
          showLoginSuccessToast();
        } else {
          showLoginFailureToast();
        }
      }
    } catch (e: any) {
      console.error('[BoaWallet] OAuth exchange error:', e);
      const fallbackSession = await getSessionSafely();
      if (fallbackSession) {
        showLoginSuccessToast();
      } else {
        showLoginFailureToast();
      }
    }
  };

  useEffect(() => {
    // Case 1: app was KILLED and relaunched by the deep link — getLaunchUrl catches it
    CapApp.getLaunchUrl().then((result) => {
      if (result?.url && isOAuthCallbackUrl(result.url)) {
        console.log('[BoaWallet] getLaunchUrl:', result.url);
        void handleOAuthUrl(result.url);
      }
    }).catch(() => {});

    // Case 2: app was in background, Android delivers deep link via appUrlOpen
    const urlListener = CapApp.addListener('appUrlOpen', (event) => {
      if (!isOAuthCallbackUrl(event.url)) return;
      console.log('[BoaWallet] appUrlOpen:', event.url);
      void handleOAuthUrl(event.url);
    });

    // Case 3: Custom Tab closed without triggering deep link (Android didn't intercept
    // the custom scheme, or user closed the browser manually).
    // Wait briefly for any in-flight appUrlOpen, then poll for session as last resort.
    const browserDoneListener = Browser.addListener('browserFinished', async () => {
      console.log('[BoaWallet] browserFinished — oauthHandled:', oauthHandledRef.current);
      if (oauthHandledRef.current) {
        oauthHandledRef.current = false;
        return;
      }
      // Poll up to 3 times with increasing delays for appUrlOpen or server-side session
      const delays = [1000, 2000, 3000];
      for (const delay of delays) {
        await new Promise(r => setTimeout(r, delay));
        if (oauthHandledRef.current) {
          oauthHandledRef.current = false;
          return;
        }
        const launch = await CapApp.getLaunchUrl().catch(() => null);
        if (launch?.url && isOAuthCallbackUrl(launch.url)) {
          await handleOAuthUrl(launch.url);
          oauthHandledRef.current = false;
          return;
        }

        const session = await getSessionSafely();
        if (session) {
          console.log('[BoaWallet] Session recovered via browserFinished poll.');
          showLoginSuccessToast();
          oauthHandledRef.current = false;
          return;
        }
      }
      oauthHandledRef.current = false;
    });

    return () => {
      urlListener.then(l => l.remove());
      browserDoneListener.then(l => l.remove());
    };
  }, []);

  const handleSecretClick = () => {
    const newCount = secretClickCount + 1;
    setSecretClickCount(newCount);
    if (newCount >= 7) {
      setShowSecretMenu(true);
      setSecretClickCount(0);
      if (secretTimeoutRef.current) clearTimeout(secretTimeoutRef.current);
    } else {
      if (secretTimeoutRef.current) clearTimeout(secretTimeoutRef.current);
      secretTimeoutRef.current = setTimeout(() => setSecretClickCount(0), 2000);
    }
  };

  const getShortName = (name: string): string => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 2) return name;
    return parts.slice(0, 2).join(' ');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('app.goodMorning' as any) || 'Bom dia';
    if (hour < 18) return t('app.goodAfternoon' as any) || 'Boa tarde';
    return t('app.goodEvening' as any) || 'Boa noite';
  };

  // --- Disable flow ---
  const handleToggleStatus = (id: string, currentStatus: string) => {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    if (currentStatus.startsWith('cancelled')) {
      handleSave({ ...sub, status: 'active' });
    } else {
      setDisablePromptSub(sub);
      setDisableType(null);
    }
  };

  const confirmDisable = (type: 'cancelled_temporary' | 'cancelled_permanent') => {
    if (disablePromptSub) {
      if (type === 'cancelled_temporary') {
        handleSave({ ...disablePromptSub, status: type });
        setRenewalPromptSub(disablePromptSub);
        setDisablePromptSub(null);
      } else {
        handleSave({ ...disablePromptSub, status: type });
        setDisablePromptSub(null);
      }
    }
  };

  const handleRenewalAnswer = (autoRenew: boolean) => {
    if (renewalPromptSub) {
      if (autoRenew) {
        handleSave({ ...renewalPromptSub, status: 'cancelled_temporary', autoRenewDate: renewalPromptSub.dueDate, reminderDisabled: false });
      } else {
        handleSave({ ...renewalPromptSub, status: 'cancelled_temporary', autoRenewDate: undefined, reminderDisabled: false });
      }
      setRenewalPromptSub(null);
    }
  };

  // --- Adjustments ---
  const handleAddAdjustment = async (adjData: Omit<Adjustment, 'id'>) => {
    const newAdj: Adjustment = { ...adjData, id: Date.now().toString() };
    const updated = [...adjustments, newAdj];
    setAdjustments(updated);
    
    if (user) {
      try {
        await supabase.from('adjustments').upsert({ ...newAdj, user_id: user.id });
      } catch (error) {
        console.error('Error adding adjustment:', error);
      }
    } else {
      localStorage.setItem('boa_adjustments', JSON.stringify(updated));
    }
  };

  const handleRemoveAdjustment = async (id: string) => {
    const updated = adjustments.filter(a => a.id !== id);
    setAdjustments(updated);
    
    if (user) {
      try {
        await supabase.from('adjustments').delete().eq('id', id).eq('user_id', user.id);
      } catch (error) {
        console.error('Error removing adjustment:', error);
      }
    } else {
      localStorage.setItem('boa_adjustments', JSON.stringify(updated));
    }
  };

  // --- Synchronization ---
  useEffect(() => {
    if (user) {
      const profilePayload: Record<string, any> = {
        id: user.id, email: user.email,
        name: user.user_metadata?.full_name || userName,
        language, base_currency: baseCurrency,
        updated_at: new Date().toISOString()
      };
      if (userHandle) profilePayload.username = userHandle;
      supabase.from('users').upsert(profilePayload);
    }
  }, [user, language, baseCurrency, userName, userHandle]);

  useEffect(() => {
    if (!user) {
      setSyncLoading(false);
      setReceivedSubscriptions([]);
      setFriends([]);
      setFriendsLoading(false);
      try { 
        const s = localStorage.getItem('subscriptions'); if (s) setSubscriptions(JSON.parse(s).map(normalizeSubscription)); 
        const a = localStorage.getItem('boa_adjustments'); if (a) setAdjustments(JSON.parse(a));
      } catch {}
      return;
    }

    const fetchInitialData = async () => {
      if (!user) return;
      console.log('[BoaWallet] Syncing data from cloud...');
      setSyncLoading(true);
      
      try {
        let ownedSubscriptions: Subscription[] = [];

        // 1. Fetch from Supabase (Primary)
        const { data: subs, error: subsError } = await supabase.from('subscriptions').select('*').eq('user_id', user.id);
        
        if (subs && subs.length > 0) {
          console.log('[BoaWallet] Found Supabase match:', subs.length);
          
          // Merge local subscriptions that might have been created while logged out
          try {
             const localSubsRaw = localStorage.getItem('subscriptions');
             if (localSubsRaw) {
               const localSubs = JSON.parse(localSubsRaw);
               if (Array.isArray(localSubs) && localSubs.length > 0) {
                 const newSubs = localSubs.filter(ls => !subs.some(s => s.id === ls.id));
                 if (newSubs.length > 0) {
                    console.log('[BoaWallet] Merging local subscriptions:', newSubs.length);
                    const toUpload = newSubs.map(s => ({ ...s, user_id: user.id }));
                    await supabase.from('subscriptions').upsert(toUpload);
                    subs.push(...toUpload);
                 }
               }
             }
          } catch(e) {}

          ownedSubscriptions = (subs as any[]).map(normalizeSubscription);
        } else if (!subsError) {
          console.log('[BoaWallet] Supabase empty, checking Firebase migration...');
          // 2. Try Firebase Migration (Secondary/Old)
          try {
            const q = query(collection(db, 'subscriptions'), where('user_id', '==', user.id));
            const querySnapshot = await getDocs(q);
            const fireSubs: any[] = [];
            querySnapshot.forEach((doc) => { fireSubs.push({ ...doc.data(), id: doc.id }); });
            
            if (fireSubs.length > 0) {
              console.log('[BoaWallet] Found Firebase data, migrating:', fireSubs.length);
              ownedSubscriptions = fireSubs.map(normalizeSubscription);
              // Migrate to Supabase
              for (const sub of fireSubs) { 
                await supabase.from('subscriptions').upsert({ ...sub, user_id: user.id }); 
              }
            } else {
              // 3. Last resort: LocalStorage
              const cachedSubs = localStorage.getItem('subscriptions_' + user.id) || localStorage.getItem('subscriptions');
              if (cachedSubs) {
                const parsed = JSON.parse(cachedSubs);
                if (Array.isArray(parsed)) {
                   console.log('[BoaWallet] Restoring from local cache:', parsed.length);
                   ownedSubscriptions = parsed.map(normalizeSubscription);
                }
              }
            }
          } catch (err) { console.error('Firebase pull failed', err); }
        }

        const [outgoingRowsResult, incomingRowsResult] = await Promise.all([
          supabase
            .from('subscription_members')
            .select('*')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('subscription_members')
            .select('*')
            .eq('member_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        const outgoingRows = ((outgoingRowsResult.data as SubscriptionMemberRow[] | null) || []);
        const incomingRows = ((incomingRowsResult.data as SubscriptionMemberRow[] | null) || []);

        const profileIds = Array.from(
          new Set([
            ...outgoingRows.map((row) => row.member_id),
            ...incomingRows.map((row) => row.owner_id),
          ])
        );

        const incomingSourceIds = Array.from(
          new Set(incomingRows.filter((row) => row.accepted).map((row) => row.subscription_id))
        );

        const [profilesResult, incomingSourcesResult] = await Promise.all([
          profileIds.length > 0
            ? supabase.from('users').select('id,name,username').in('id', profileIds)
            : Promise.resolve({ data: [] as FriendProfile[] }),
          incomingSourceIds.length > 0
            ? supabase.from('subscriptions').select('*').in('id', incomingSourceIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const profilesById = Object.fromEntries(
          (((profilesResult as any).data as FriendProfile[] | null) || []).map((profile) => [profile.id, profile])
        ) as Record<string, FriendProfile>;
        hydrateUserSearchCache(Object.values(profilesById));

        const mergedOwnedSubscriptions = mergeOwnedSubscriptionsWithShareRows(
          ownedSubscriptions,
          outgoingRows,
          profilesById
        );

        const receivedSharedSubscriptions = buildReceivedSubscriptions(
          incomingRows,
          ((((incomingSourcesResult as any).data as any[] | null) || []).map(normalizeSubscription)),
          profilesById,
          user.id
        );

        setSubscriptions(mergedOwnedSubscriptions);
        setReceivedSubscriptions(receivedSharedSubscriptions);
        localStorage.setItem('subscriptions_' + user.id, JSON.stringify(mergedOwnedSubscriptions));
        void refreshFriends(user.id);
        void prefetchBoaUsers(user.id, 40);
        // Sincroniza dados com o app do relógio
        void syncToWatch(user, userHandle, mergedOwnedSubscriptions, baseCurrency, exchangeRates);

        const { data: adjs, error: adjsError } = await supabase.from('adjustments').select('*').eq('user_id', user.id);
        if (adjs && adjs.length > 0) {
          setAdjustments(adjs as any[]);
          localStorage.setItem('adjustments_' + user.id, JSON.stringify(adjs));
        }
      } catch (err) {
        console.error('[BoaWallet] Sync failed', err);
      } finally {
        setSyncLoading(false);
      }
    };

    fetchInitialData();

    const subsSubscription = supabase.channel('subs_v15_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` }, fetchInitialData).subscribe();

    const adjsSubscription = supabase.channel('adjs_v15_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'adjustments', filter: `user_id=eq.${user.id}` }, fetchInitialData).subscribe();

    const outgoingSharesSubscription = supabase.channel('shared_owner_v3_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_members', filter: `owner_id=eq.${user.id}` }, fetchInitialData).subscribe();

    const incomingSharesSubscription = supabase.channel('shared_member_v3_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_members', filter: `member_id=eq.${user.id}` }, fetchInitialData).subscribe();

    return () => {
      supabase.removeChannel(subsSubscription);
      supabase.removeChannel(adjsSubscription);
      supabase.removeChannel(outgoingSharesSubscription);
      supabase.removeChannel(incomingSharesSubscription);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setFriends([]);
      return;
    }

    refreshFriends(user.id);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void prefetchBoaUsers(user.id, 40);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    void (async () => {
      try {
        const released = await releaseDueSubscriptionEscrows();
        const recurring = await processRecurringMemberships(user.id);
        const claimed = await claimPendingTransfers(user.id, userHandle);

        if (cancelled) return;

        if (released > 0) {
          showToast(
            m(
              `${released} repasse(s) em custodia foram liberados.`,
              `${released} escrow payout(s) were released.`,
              `${released} pago(s) en custodia fueron liberados.`,
              `${released} pagamento/i in custodia sono stati rilasciati.`
            ),
            true
          );
        }

        if (recurring > 0) {
          showToast(
            m(
              `${recurring} cobranca(s) mensais foram processadas.`,
              `${recurring} recurring charge(s) were processed.`,
              `${recurring} cobro(s) mensuales fueron procesados.`,
              `${recurring} addebito/i mensili sono stati elaborati.`
            ),
            true
          );
        }

        if (claimed > 0) {
          showToast(
            m(
              `${claimed} transferencia(s) pendente(s) foram creditadas na sua carteira.`,
              `${claimed} pending transfer(s) were credited to your wallet.`,
              `${claimed} transferencia(s) pendiente(s) fueron acreditadas en tu cartera.`,
              `${claimed} trasferimento/i in attesa sono stati accreditati sul tuo wallet.`
            ),
            true
          );
        }
      } catch (error) {
        console.error('[BoaWallet] Platform background sync failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userHandle]);

  // --- Auth ---
  const handleLogin = async (method: 'google' | 'web3' = 'google') => {
    setLoggingIn(true);
    setLoginMethod(method);
    try {
      if (method === 'web3') {
        if (!canUseWeb3Login) {
          showToast(m('Nenhuma carteira web3 encontrada neste dispositivo.', 'No Web3 wallet found on this device.', 'No se encontro una wallet web3 en este dispositivo.', 'Nessun wallet web3 trovato su questo dispositivo.'), false);
          return;
        }

        const chain = (window as any).ethereum ? 'ethereum' : 'solana';
        const { error } = await supabase.auth.signInWithWeb3({
          chain,
          statement: 'Sign in to BoaWallet',
        } as any);

        if (error) {
          console.error('[BoaWallet] Web3 login failed:', error.message);
          showToast(m('Erro ao conectar a carteira. Tente novamente.', 'Wallet login failed. Please try again.', 'Error al conectar la wallet. Intentalo de nuevo.', 'Errore di accesso con wallet. Riprova.'), false);
          return;
        }

        showToast(m('Carteira conectada!', 'Wallet connected!', 'Wallet conectada!', 'Wallet collegato!'), true);
        return;
      }
      if (isNativePlatform) {
        oauthHandledRef.current = false;
        // Native OAuth flow — Supabase redirects directly to io.boa.wallet://auth?code=...
        // Android intercepts the custom scheme via the intent filter in AndroidManifest.xml
        // and delivers it to the app via Capacitor's appUrlOpen event.
        // The code is then exchanged for a session in handleOAuthUrl().
        try {
          const { data: oauthData, error: oauthErr } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: NATIVE_OAUTH_CALLBACK,
              skipBrowserRedirect: true,
            },
          });
          if (oauthErr || !oauthData?.url) throw oauthErr ?? new Error('No OAuth URL');
          console.log('[BoaWallet] Opening OAuth URL:', oauthData.url);
          await Browser.open({ url: oauthData.url, presentationStyle: 'popover' });
        } catch (error: any) {
          console.error('[BoaWallet] Native Google login failed:', error);
          showToast(
            m(
              'Erro ao abrir login. Tente novamente.',
              'Could not open login. Please try again.',
              'No se pudo abrir el login. Intentalo de nuevo.',
              'Impossibile aprire il login. Riprova.'
            ),
            false
          );
        }
        // Session arrives asynchronously via appUrlOpen → handleOAuthUrl → exchangeCodeForSession
        return;
      } else {
        // Web platform
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('[BoaWallet] Login error:', error);
      showToast(m('Erro ao fazer login. Tente novamente.', 'Login failed. Please try again.', 'Error al iniciar sesión. Inténtalo de nuevo.', 'Errore di accesso. Riprova.'), false);
    } finally {
      setLoggingIn(false);
      setLoginMethod(null);
    }
  };

  const handleLogout = async () => {
    setShowProfileMenu(false);
    // Salva cache local antes de limpar
    if (user) {
      localStorage.setItem('subscriptions_' + user.id, JSON.stringify(subscriptions));
      localStorage.setItem('adjustments_' + user.id, JSON.stringify(adjustments));
    }
    // Limpa estado local PRIMEIRO para garantir UX imediata
    setUserName('');
    setSubscriptions([]);
    setReceivedSubscriptions([]);
    setAdjustments([]);
    // Avisa o relógio que o usuário saiu
    void syncToWatch(null, '', [], baseCurrency, exchangeRates);
    // Encerra sessões no servidor (local scope = sem chamada de rede)
    try {
      await firebaseSignOut(firebaseAuth).catch(() => {});
      await FirebaseAuthentication.signOut().catch(() => {});
      await supabase.auth.signOut({ scope: 'global' });
      await clearPersistedTokens();
      setGoogleAccessToken(null);
    } catch (error) {
      console.error('Logout error', error);
    }
  };
  
  // FULL row — all known columns (requires ALTER TABLE from supabase_setup.sql to have been run)
  const toSupabaseRow = (sub: Subscription, userId: string) => ({
    id: sub.id,
    user_id: userId,
    userId: (sub as any).userId || (sub as any).user_id || userId,
    name: sub.name,
    type: sub.type,
    emoji: sub.emoji,
    logoUrl: sub.logoUrl,
    bankLogoUrl: sub.bankLogoUrl,
    isPublic: sub.isPublic,
    allowPublicParticipants: sub.allowPublicParticipants,
    publicSharePriceSats: sub.publicSharePriceSats,
    publicPaymentType: sub.publicPaymentType,
    publicCredentialsEnabled: sub.publicCredentialsEnabled,
    category: sub.category,
    notes: embedCredentialsInNotes(sub.notes, {
      username: sub.serviceUsername,
      password: sub.servicePassword,
    }),
    status: sub.status,
    costAmount: sub.costAmount,
    costCurrency: sub.costCurrency,
    billingCycle: sub.billingCycle,
    dueDate: sub.dueDate,
    dueMonth: sub.dueMonth,
    originalCost: sub.originalCost,
    paymentMethod: sub.paymentMethod,
    paymentSource: sub.paymentSource,
    isPromotional: sub.isPromotional,
    promoEndDate: sub.promoEndDate,
    hasCashback: sub.hasCashback,
    cashbackPercentage: sub.cashbackPercentage,
    autoRenewDate: sub.autoRenewDate,
    reminderDisabled: sub.reminderDisabled,
    paymentHistory: sub.paymentHistory,
    hasEarlyPayDiscount: sub.hasEarlyPayDiscount,
    earlyPayDate: sub.earlyPayDate,
    earlyPayCost: sub.earlyPayCost,
    hasIncome: sub.hasIncome,
    incomeAmount: sub.incomeAmount,
    incomeCurrency: sub.incomeCurrency,
    incomeFrequency: sub.incomeFrequency,
    incomeSourceDescription: sub.incomeSourceDescription,
    sharedWith: sub.sharedWith,
    subItems: sub.subItems,
    isSingleExpense: sub.isSingleExpense,
    isFlexibleDate: sub.isFlexibleDate,
    fiatReferenceAmount: sub.fiatReferenceAmount,
    fiatReferenceCurrency: sub.fiatReferenceCurrency,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  });

  // Compatibility row: keeps the legacy mixed schema already used by the app,
  // but writes the marketplace fields using the snake_case migration names.
  const toMarketplaceCompatibleSupabaseRow = (sub: Subscription, userId: string) => {
    const row = {
      ...toSupabaseRow(sub, userId),
      allow_public_participants: sub.allowPublicParticipants,
      public_share_price_sats: sub.publicSharePriceSats,
      public_payment_type: sub.publicPaymentType,
      public_credentials_enabled: sub.publicCredentialsEnabled,
    } as Record<string, any>;

    delete row.allowPublicParticipants;
    delete row.publicSharePriceSats;
    delete row.publicPaymentType;
    delete row.publicCredentialsEnabled;

    return row;
  };

  // MINIMAL row — only the original columns guaranteed to exist in ALL Supabase installs
  const toMinimalSupabaseRow = (sub: Subscription, userId: string) => ({
    id: sub.id,
    user_id: userId,
    userId: (sub as any).userId || (sub as any).user_id || userId,
    name: sub.name,
    logoUrl: sub.logoUrl,
    emoji: sub.emoji,
    isPublic: sub.isPublic,
    category: sub.category,
    notes: embedCredentialsInNotes(sub.notes, {
      username: sub.serviceUsername,
      password: sub.servicePassword,
    }),
    status: sub.status,
    costAmount: sub.costAmount,
    costCurrency: sub.costCurrency,
    billingCycle: sub.billingCycle,
    dueDate: sub.dueDate,
    paymentSource: sub.paymentSource,
    paymentMethod: sub.paymentMethod,
    isPromotional: sub.isPromotional,
    promoEndDate: sub.promoEndDate,
    hasCashback: sub.hasCashback,
    cashbackPercentage: sub.cashbackPercentage,
    autoRenewDate: sub.autoRenewDate,
    reminderDisabled: sub.reminderDisabled,
    paymentHistory: sub.paymentHistory,
    hasEarlyPayDiscount: sub.hasEarlyPayDiscount,
    earlyPayDate: sub.earlyPayDate,
    earlyPayCost: sub.earlyPayCost,
    hasIncome: sub.hasIncome,
    incomeAmount: sub.incomeAmount,
    incomeCurrency: sub.incomeCurrency,
    incomeFrequency: sub.incomeFrequency,
    incomeSourceDescription: sub.incomeSourceDescription,
    sharedWith: sub.sharedWith,
    subItems: sub.subItems,
    fiatReferenceAmount: sub.fiatReferenceAmount,
    fiatReferenceCurrency: sub.fiatReferenceCurrency,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  });

  // Two-tier Supabase save: tries full row first, falls back to minimal if column errors
  const saveToSupabase = async (
    rows: any[],
    minimalRows: any[],
    compatibilityRows?: any[]
  ): Promise<'ok' | 'partial' | 'fail'> => {
    try {
      await withTimeout(supabase.auth.refreshSession(), 3000, 'Session refresh timed out');
    } catch { /* session refresh best-effort */ }

    let e1: any;
    try {
      const result = await withTimeout(
        supabase.from('subscriptions').upsert(rows),
        6000,
        'Subscription save timed out'
      );
      e1 = result.error;
    } catch (error) {
      console.error('[BoaWallet] Full upsert failed with timeout/error:', error);
      return 'fail';
    }

    if (!e1) return 'ok';

    const isColumnError = e1.code === '42703' || e1.message?.toLowerCase().includes('column');
    console.warn('[BoaWallet] Full upsert failed:', e1.message, '| column error?', isColumnError);

    if (isColumnError) {
      if (compatibilityRows?.length) {
        try {
          const { error: eCompat } = await withTimeout(
            supabase.from('subscriptions').upsert(compatibilityRows),
            6000,
            'Compatibility subscription save timed out'
          );
          if (!eCompat) return 'ok';
          console.warn('[BoaWallet] Compatibility upsert failed:', eCompat.message);
        } catch (error) {
          console.error('[BoaWallet] Compatibility upsert failed with timeout/error:', error);
        }
      }

      // Tier 2: minimal columns (always works with original table schema)
      try {
        const { error: e2 } = await withTimeout(
          supabase.from('subscriptions').upsert(minimalRows),
          6000,
          'Minimal subscription save timed out'
        );
        if (!e2) return 'partial'; // saved, but missing some extended fields
        console.error('[BoaWallet] Minimal upsert also failed:', e2.message);
      } catch (error) {
        console.error('[BoaWallet] Minimal upsert also failed with timeout/error:', error);
      }
    }
    return 'fail';
  };

  // Ref to avoid stale closure in processSyncQueue
  const subscriptionsRef = useRef(subscriptions);
  useEffect(() => { subscriptionsRef.current = subscriptions; }, [subscriptions]);

  const processSyncQueue = async () => {
    if (!user) return;
    const dueItems = getDueItems();
    if (dueItems.length === 0) return;

    console.log(`[BoaWallet] Processing ${dueItems.length} pending sync items`);

    for (const queueItem of dueItems) {
      const sub = subscriptionsRef.current.find(s => s.id === queueItem.subscriptionId);
      if (!sub) {
        removeFromSyncQueue(queueItem.subscriptionId);
        continue;
      }

      const result = await saveToSupabase(
        [toSupabaseRow(sub, user.id)],
        [toMinimalSupabaseRow(sub, user.id)],
        [toMarketplaceCompatibleSupabaseRow(sub, user.id)]
      );

      if (result !== 'fail') {
        removeFromSyncQueue(sub.id);
        await syncLinkedMembersForSubscription(sub, user.id);
        setDoc(doc(db, 'subscriptions', sub.id), sanitizeForFirebase(sub) as any).catch(() => {});
        setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, syncStatus: 'synced' as const } : s));
        console.log(`[BoaWallet] Sync queue: ${sub.name} synced successfully`);
      } else {
        markRetried(sub.id);
        if (queueItem.retryCount >= 4) {
          setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, syncStatus: 'failed' as const } : s));
        }
      }
    }
  };

  // Process sync queue on mount, every 5 minutes, and on app resume
  useEffect(() => {
    if (!user) return;

    const mountTimeout = setTimeout(processSyncQueue, 3000);
    const interval = setInterval(processSyncQueue, 5 * 60 * 1000);

    let resumeListener: any;
    if (isNativePlatform) {
      resumeListener = CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) setTimeout(processSyncQueue, 1000);
      });
    }

    return () => {
      clearTimeout(mountTimeout);
      clearInterval(interval);
      resumeListener?.then?.((l: any) => l.remove());
    };
  }, [user]);

  const normalizeSubscription = (s: any): Subscription => {
    const normalizeDate = (d: any) => {
      if (!d) return new Date().toISOString();
      if (typeof d === 'string' || typeof d === 'number') return d;
      // Handle Firestore Timestamp object
      if (d && typeof d === 'object' && 'seconds' in d) {
        return new Date(d.seconds * 1000).toISOString();
      }
      return new Date().toISOString();
    };

    const parsedNotes = stripCredentialsFromNotes(s.notes);

    return {
      ...s,
      id: String(s.id || Date.now() + Math.random()),
      name: s.name || '',
      logoUrl: normalizeLogoUrl(s.logoUrl, s.name || ''),
      emoji: s.emoji || '📺',
      category: s.category || 'Outros',
      notes: parsedNotes.notes,
      serviceUsername: typeof s.serviceUsername === 'string' && s.serviceUsername.trim()
        ? s.serviceUsername.trim()
        : parsedNotes.credentials?.username,
      servicePassword: typeof s.servicePassword === 'string' && s.servicePassword.trim()
        ? s.servicePassword.trim()
        : parsedNotes.credentials?.password,
      isPublic: typeof s.isPublic === 'boolean' ? s.isPublic : !!s.is_public,
      allowPublicParticipants: typeof s.allowPublicParticipants === 'boolean'
        ? s.allowPublicParticipants
        : !!s.allow_public_participants,
      publicSharePriceSats: parseInt(String(s.publicSharePriceSats ?? s.public_share_price_sats ?? 0), 10) || 0,
      publicPaymentType: (s.publicPaymentType ?? s.public_payment_type) === 'monthly' ? 'monthly' : 'onetime',
      publicCredentialsEnabled: typeof s.publicCredentialsEnabled === 'boolean'
        ? s.publicCredentialsEnabled
        : typeof s.public_credentials_enabled === 'boolean'
          ? s.public_credentials_enabled
        : !!(parsedNotes.credentials?.password || parsedNotes.credentials?.username),
      costAmount: parseFloat(s.costAmount) || 0,
      costCurrency: (s.costCurrency as Currency) || 'BRL',
      billingCycle: (s.billingCycle as BillingCycle) || 'Monthly',
      dueDate: parseInt(s.dueDate) || 1,
      createdAt: normalizeDate(s.createdAt),
      updatedAt: normalizeDate(s.updatedAt || s.createdAt),
      user_id: s.user_id || s.userId,
      userId: s.userId || s.user_id,
      bankLogoUrl: s.bankLogoUrl || '',
      subItems: (s.subItems || []).map((i: any) => ({
        id: String(i.id || Math.random()),
        name: i.name || '',
        costAmount: parseFloat(i.costAmount) || 0
      })),
      sharedWith: (s.sharedWith || []).map((m: any) => normalizeSharedMember(m, ((m?.currency as Currency) || (s.costCurrency as Currency) || 'BRL'))),
      hasIncome: !!s.hasIncome,
      hasCashback: !!s.hasCashback,
      hasEarlyPayDiscount: !!s.hasEarlyPayDiscount,
      isPromotional: !!s.isPromotional
    } as Subscription;
  };

  const normalizeMembersForSubscription = (subscription: Partial<Subscription>): SharedMember[] => {
    const baseAmount = Number(subscription.costAmount) || 0;
    const fallbackCurrency = (subscription.costCurrency as Currency) || 'BRL';

    return (subscription.sharedWith || []).map((member) =>
      normalizeSharedMember(
        {
          ...member,
          amount: resolveSharedMemberAmount(member, baseAmount),
        },
        (member.currency as Currency) || fallbackCurrency
      )
    );
  };

  const calculateConfirmedSharedIncome = (
    members: SharedMember[],
    incomeCurrency: Currency,
    fallbackCurrency: Currency
  ) => {
    return members.reduce((total, member) => {
      const isConfirmed = !member.userId || !!member.accepted;
      if (!isConfirmed) return total;

      return total + convertCurrency(
        Number(member.amount || 0),
        member.currency || fallbackCurrency,
        incomeCurrency,
        exchangeRates
      );
    }, 0);
  };

  const upsertFriendships = async (currentUserId: string, friendIds: string[]) => {
    const uniqueFriendIds = Array.from(new Set(friendIds.filter((friendId) => friendId && friendId !== currentUserId)));
    if (uniqueFriendIds.length === 0) return;

    const rows = uniqueFriendIds.map((friendId) => {
      const [userOne, userTwo] = sortFriendPair(currentUserId, friendId);
      return {
        user_one: userOne,
        user_two: userTwo,
        created_by: currentUserId,
      };
    });

    await withTimeout(
      supabase.from('friendships').upsert(rows, {
        onConflict: 'user_one,user_two',
        ignoreDuplicates: true,
      } as any),
      4000,
      'Friendship upsert timed out'
    );
  };

  const refreshFriends = async (currentUserId?: string) => {
    if (!currentUserId) {
      setFriends([]);
      setFriendsLoading(false);
      return;
    }

    const cachedFriends = readFriendsCache(currentUserId);
    if (cachedFriends.length > 0) {
      setFriends(cachedFriends);
      hydrateUserSearchCache(cachedFriends);
      setFriendsLoading(false);
    } else {
      setFriendsLoading(true);
    }

    try {
      const { data: rows } = await withTimeout(
        supabase
          .from('friendships')
          .select('id,user_one,user_two,created_by,created_at')
          .or(`user_one.eq.${currentUserId},user_two.eq.${currentUserId}`)
          .order('created_at', { ascending: false }),
        4500,
        'Friends request timed out'
      );

      const friendshipRows = (rows as FriendshipRow[] | null) || [];
      const friendIds = Array.from(new Set(friendshipRows.map((row) => row.user_one === currentUserId ? row.user_two : row.user_one)));

      if (friendIds.length === 0) {
        setFriends([]);
        writeFriendsCache(currentUserId, []);
        return;
      }

      const { data: profiles } = await withTimeout(
        supabase
          .from('users')
          .select('id,name,username')
          .in('id', friendIds),
        4500,
        'Friend profiles request timed out'
      );

      const profilesById = Object.fromEntries(
        (((profiles as FriendProfile[] | null) || []).map((profile) => [profile.id, profile]))
      ) as Record<string, FriendProfile>;

      const nextFriends = friendshipRows
        .map((row) => {
          const friendId = row.user_one === currentUserId ? row.user_two : row.user_one;
          const profile = profilesById[friendId];
          return profile
            ? {
                ...profile,
                createdAt: row.created_at,
              }
            : null;
        })
        .filter(Boolean) as FriendProfile[];

      nextFriends.sort((left, right) => {
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        return rightTime - leftTime;
      });

      hydrateUserSearchCache(nextFriends);
      setFriends(nextFriends);
      writeFriendsCache(currentUserId, nextFriends);
    } catch (error) {
      console.error('[BoaWallet] Failed to load friendships', error);
      if (cachedFriends.length === 0) {
        setFriends([]);
      }
    } finally {
      setFriendsLoading(false);
    }
  };

  const handleAddFriend = async (friend: { id: string; name?: string; username: string }) => {
    if (!user) return false;

    const optimisticFriend: FriendProfile = {
      id: friend.id,
      name: friend.name,
      username: friend.username.toLowerCase(),
      createdAt: new Date().toISOString(),
    };

    hydrateUserSearchCache([friend]);
    setFriends((currentFriends) => {
      const nextFriends = [
        optimisticFriend,
        ...currentFriends.filter((currentFriend) => currentFriend.id !== friend.id),
      ];
      writeFriendsCache(user.id, nextFriends);
      return nextFriends;
    });

    try {
      await upsertFriendships(user.id, [friend.id]);
      void refreshFriends(user.id);
      showToast(
        m(
          `@${friend.username} adicionado aos amigos!`,
          `@${friend.username} added to friends!`,
          `@${friend.username} agregado a amigos!`,
          `@${friend.username} aggiunto agli amici!`
        ),
        true
      );
      return true;
    } catch (error) {
      console.error('[BoaWallet] Failed to add friend manually', error);
      showToast(
        m(
          'Nao foi possivel adicionar o amigo agora.',
          'Could not add the friend right now.',
          'No se pudo agregar al amigo ahora.',
          'Non e stato possibile aggiungere l amico ora.'
        ),
        false
      );
      return false;
    }
  };

  const syncLinkedMembersForSubscription = async (subscription: Subscription, ownerId: string) => {
    const linkedMembers = (subscription.sharedWith || []).filter((member) => !!member.userId);
    const linkedMemberIds = linkedMembers
      .map((member) => member.userId)
      .filter(Boolean) as string[];

    let existingRows: Array<Record<string, any>> | null = null;
    const { data: fullExistingRows, error: fullExistingRowsError } = await supabase
      .from('subscription_members')
      .select('member_id,accepted,payment_mode,payment_type,bitcoin_amount_sats,payment_status,credentials_unlocked,share_credentials,platform_fee_sats,guarantee_sats,last_paid_at,next_payment_due_at,pending_release_until,latest_payment_event_id,public_join')
      .eq('subscription_id', subscription.id)
      .eq('owner_id', ownerId);

    if (fullExistingRowsError) {
      const isColumnError = fullExistingRowsError.code === '42703' || fullExistingRowsError.message?.toLowerCase().includes('column');
      if (!isColumnError) throw fullExistingRowsError;

      const { data: minimalExistingRows, error: minimalExistingRowsError } = await supabase
        .from('subscription_members')
        .select('member_id,accepted')
        .eq('subscription_id', subscription.id)
        .eq('owner_id', ownerId);

      if (minimalExistingRowsError) throw minimalExistingRowsError;
      existingRows = (minimalExistingRows as Array<Record<string, any>> | null) || [];
    } else {
      existingRows = (fullExistingRows as Array<Record<string, any>> | null) || [];
    }

    const existingRowsByMemberId = new Map(
      ((existingRows || []).map((row) => [String(row.member_id), row]))
    );

    const rowsToUpsert = linkedMembers.map((member) => ({
      ...(existingRowsByMemberId.get(String(member.userId)) || {}),
      subscription_id: subscription.id,
      owner_id: ownerId,
      member_id: member.userId,
      amount: Number(member.amount || 0),
      currency: member.currency || subscription.costCurrency,
      accepted: !!(existingRowsByMemberId.get(String(member.userId))?.accepted || member.accepted),
      payment_mode: member.paymentMode || existingRowsByMemberId.get(String(member.userId))?.payment_mode || 'immediate',
      payment_type: member.paymentType || existingRowsByMemberId.get(String(member.userId))?.payment_type || 'onetime',
      payment_status: member.paymentStatus || existingRowsByMemberId.get(String(member.userId))?.payment_status || 'unpaid',
      bitcoin_amount_sats: Number(member.bitcoinAmountSats ?? existingRowsByMemberId.get(String(member.userId))?.bitcoin_amount_sats ?? 0),
      share_credentials: !!(member.shareCredentials ?? existingRowsByMemberId.get(String(member.userId))?.share_credentials),
      credentials_unlocked: !!(member.credentialsUnlocked ?? existingRowsByMemberId.get(String(member.userId))?.credentials_unlocked),
      platform_fee_sats: Number(member.platformFeeSats ?? existingRowsByMemberId.get(String(member.userId))?.platform_fee_sats ?? 0),
      last_paid_at: member.lastPaidAt || existingRowsByMemberId.get(String(member.userId))?.last_paid_at || null,
      next_payment_due_at: member.nextPaymentDueAt || existingRowsByMemberId.get(String(member.userId))?.next_payment_due_at || null,
      pending_release_until: member.pendingReleaseUntil || existingRowsByMemberId.get(String(member.userId))?.pending_release_until || null,
      latest_payment_event_id: member.latestPaymentEventId || existingRowsByMemberId.get(String(member.userId))?.latest_payment_event_id || null,
      public_join: !!(member.publicJoin ?? existingRowsByMemberId.get(String(member.userId))?.public_join),
    }));

    const removedIds = (((existingRows as { member_id: string }[] | null) || [])
      .map((row) => row.member_id)
      .filter((memberId) => !linkedMemberIds.includes(memberId)));

    if (rowsToUpsert.length > 0) {
      const { error } = await supabase.from('subscription_members').upsert(rowsToUpsert, {
        onConflict: 'subscription_id,member_id',
      } as any);
      if (error) {
        const isColumnError = error.code === '42703' || error.message?.toLowerCase().includes('column');
        if (!isColumnError) throw error;

        const minimalRowsToUpsert = linkedMembers.map((member) => ({
          subscription_id: subscription.id,
          owner_id: ownerId,
          member_id: member.userId,
          amount: Number(member.amount || 0),
          currency: member.currency || subscription.costCurrency,
          accepted: !!(existingRowsByMemberId.get(String(member.userId))?.accepted || member.accepted),
        }));

        const { error: minimalError } = await supabase.from('subscription_members').upsert(minimalRowsToUpsert, {
          onConflict: 'subscription_id,member_id',
        } as any);
        if (minimalError) throw minimalError;
      }

      hydrateUserSearchCache(
        linkedMembers.map((member) => ({
          id: String(member.userId),
          name: member.name,
          username: member.username,
        }))
      );
      await upsertFriendships(ownerId, linkedMemberIds);
      void refreshFriends(ownerId);
    }

    if (removedIds.length > 0) {
      const { error } = await supabase
        .from('subscription_members')
        .delete()
        .eq('subscription_id', subscription.id)
        .eq('owner_id', ownerId)
        .in('member_id', removedIds);

      if (error) throw error;
    }
  };

  const persistOwnedSubscription = async (
    subscription: Subscription,
    options?: {
      closeForm?: boolean;
      successMessage?: string;
      localOnlyMessage?: string;
      silentSuccess?: boolean;
    }
  ) => {
    const closeForm = options?.closeForm ?? false;

    if (!user) {
      const normalizedSub = normalizeSubscription(subscription);
      const updatedLocalSubscriptions = subscriptions.find((item) => item.id === normalizedSub.id)
        ? subscriptions.map((item) => item.id === normalizedSub.id ? normalizedSub : item)
        : [...subscriptions, normalizedSub];
      setSubscriptions(updatedLocalSubscriptions);
      localStorage.setItem('subscriptions', JSON.stringify(updatedLocalSubscriptions));

      if (!options?.silentSuccess) {
        showToast(options?.successMessage || m('Item salvo!', 'Item saved!', 'Â¡Elemento guardado!', 'Elemento salvato!'), true);
      }

      if (closeForm) {
        setIsFormOpen(false);
        setEditingSub(undefined);
      }
      return normalizedSub;
    }

    const isNew = !subscriptions.find((item) => item.id === subscription.id);
    const normalizedSharedWith = normalizeMembersForSubscription(subscription);
    const incomeCurrency = ((subscription.incomeCurrency as Currency) || (subscription.costCurrency as Currency) || 'BRL');
    const sharedIncomeTotal = calculateConfirmedSharedIncome(
      normalizedSharedWith,
      incomeCurrency,
      (subscription.costCurrency as Currency) || 'BRL'
    );

    const fullSub = normalizeSubscription({
      ...subscription,
      sharedWith: normalizedSharedWith,
      hasIncome: normalizedSharedWith.length > 0 ? true : subscription.hasIncome,
      incomeCurrency,
      incomeAmount: normalizedSharedWith.length > 0 ? sharedIncomeTotal : subscription.incomeAmount,
      user_id: user.id,
      createdAt: isNew ? new Date().toISOString() : subscription.createdAt,
      updatedAt: new Date().toISOString(),
    });

    const result = await saveToSupabase(
      [toSupabaseRow(fullSub, user.id)],
      [toMinimalSupabaseRow(fullSub, user.id)],
      [toMarketplaceCompatibleSupabaseRow(fullSub, user.id)]
    );

    if (result !== 'fail') {
      fullSub.syncStatus = 'synced';
      removeFromSyncQueue(fullSub.id);
      await syncLinkedMembersForSubscription(fullSub, user.id);
      setDoc(doc(db, 'subscriptions', fullSub.id), sanitizeForFirebase(fullSub) as any).catch(() => {});
      if (!options?.silentSuccess) {
        showToast(options?.successMessage || m('Item salvo!', 'Item saved!', '¡Elemento guardado!', 'Elemento salvato!'), true);
      }
    } else {
      fullSub.syncStatus = 'pending';
      addToSyncQueue(fullSub.id, user.id);
      showToast(options?.localOnlyMessage || m(
        'Item salvo localmente — sincroniza automaticamente',
        'Item saved locally — will sync automatically',
        'Elemento guardado localmente — se sincronizará',
        'Elemento salvato in locale — sincronizzazione automatica'
      ), false);
    }

    // Update state with syncStatus
    const finalSubscriptions = (isNew
      ? [...subscriptions, fullSub]
      : subscriptions.map((item) => item.id === fullSub.id ? fullSub : item));
    setSubscriptions(finalSubscriptions);
    localStorage.setItem('subscriptions_' + user.id, JSON.stringify(finalSubscriptions));
    localStorage.setItem('subscriptions', JSON.stringify(finalSubscriptions));

    if (closeForm) {
      setIsFormOpen(false);
      setEditingSub(undefined);
    }

    // Sincroniza com o app do relógio em background
    void syncToWatch(user, userHandle, finalSubscriptions, baseCurrency, exchangeRates);

    return fullSub;
  };

  const mergeOwnedSubscriptionsWithShareRows = (
    ownedSubscriptions: Subscription[],
    outgoingRows: SubscriptionMemberRow[],
    profilesById: Record<string, FriendProfile>
  ): Subscription[] => {
    return ownedSubscriptions.map((subscription) => {
      const baseMembers = subscription.sharedWith || [];
      const manualMembers = baseMembers
        .filter((member) => !member.userId)
        .map((member) => normalizeSharedMember(member, member.currency || subscription.costCurrency));

      const linkedMembers = outgoingRows
        .filter((row) => row.subscription_id === subscription.id)
        .map((row) => {
          const profile = profilesById[row.member_id];
          const existing = findSharedMemberForUser(baseMembers, row.member_id, profile?.username);
          const fallbackCurrency = ((row.currency as Currency) || existing?.currency || subscription.costCurrency);

          return normalizeSharedMember(
            {
              ...existing,
              id: row.member_id,
              userId: row.member_id,
              username: profile?.username || existing?.username,
              name: profile?.name || existing?.name || profile?.username || existing?.username || 'Usuario',
              amount: Number(row.amount ?? existing?.amount ?? 0),
              currency: fallbackCurrency,
              paymentDate: existing?.paymentDate || subscription.dueDate,
              info: existing?.info || '',
              accepted: !!row.accepted,
              shareCredentials: typeof row.share_credentials === 'boolean'
                ? row.share_credentials
                : existing?.shareCredentials,
              paymentMode: row.payment_mode || existing?.paymentMode,
              paymentType: row.payment_type || existing?.paymentType,
              paymentStatus: row.payment_status || existing?.paymentStatus,
              bitcoinAmountSats: Number(row.bitcoin_amount_sats ?? existing?.bitcoinAmountSats ?? 0),
              platformFeeSats: Number(row.platform_fee_sats ?? existing?.platformFeeSats ?? 0),
              guaranteeSats: Number(row.guarantee_sats ?? existing?.guaranteeSats ?? 0),
              credentialsUnlocked: typeof row.credentials_unlocked === 'boolean'
                ? row.credentials_unlocked
                : existing?.credentialsUnlocked,
              lastPaidAt: row.last_paid_at || existing?.lastPaidAt,
              nextPaymentDueAt: row.next_payment_due_at || existing?.nextPaymentDueAt,
              pendingReleaseUntil: row.pending_release_until || existing?.pendingReleaseUntil,
              latestPaymentEventId: row.latest_payment_event_id || existing?.latestPaymentEventId,
              publicJoin: typeof row.public_join === 'boolean' ? row.public_join : existing?.publicJoin,
            },
            fallbackCurrency
          );
        });

      const mergedSharedWith = [...manualMembers, ...linkedMembers];
      const incomeCurrency = (subscription.incomeCurrency as Currency) || (subscription.costCurrency as Currency) || 'BRL';

      return normalizeSubscription({
        ...subscription,
        sharedWith: mergedSharedWith,
        hasIncome: mergedSharedWith.length > 0 || subscription.hasIncome,
        incomeCurrency,
        incomeAmount: mergedSharedWith.length > 0
          ? calculateConfirmedSharedIncome(
              mergedSharedWith,
              incomeCurrency,
              (subscription.costCurrency as Currency) || 'BRL'
            )
          : subscription.incomeAmount,
      });
    });
  };

  const buildReceivedSubscriptions = (
    incomingRows: SubscriptionMemberRow[],
    sharedSourceSubscriptions: Subscription[],
    profilesById: Record<string, FriendProfile>,
    currentUserId: string
  ): Subscription[] => {
    const sourceById = Object.fromEntries(sharedSourceSubscriptions.map((subscription) => [subscription.id, subscription]));

    return incomingRows
      .filter((row) => row.accepted)
      .map((row) => {
        const source = sourceById[row.subscription_id];
        const owner = profilesById[row.owner_id];
        const linkedMember = source
          ? findSharedMemberForUser(source.sharedWith, currentUserId, undefined)
          : undefined;

        const fallbackCurrency = ((row.currency as Currency) || linkedMember?.currency || source?.costCurrency || 'BRL');
        const shareCredentials = typeof row.share_credentials === 'boolean'
          ? row.share_credentials
          : linkedMember?.shareCredentials;
        const credentialsUnlocked = typeof row.credentials_unlocked === 'boolean'
          ? row.credentials_unlocked
          : !!(row.accepted && (row.payment_mode !== 'bitcoin') && shareCredentials);
        const shouldShareCredentials = !!(shareCredentials && credentialsUnlocked);
        const paymentStatus = row.payment_status || (row.payment_type === 'monthly' ? 'active' : 'paid');
        const accessNote = shouldShareCredentials
          ? undefined
          : 'O usuario nao disponibilizou a senha';
        const sharedSubscription = normalizeSubscription({
          ...(source || {}),
          id: `shared:${row.id}`,
          sourceShareId: row.id,
          sourceSubscriptionId: row.subscription_id,
          user_id: currentUserId,
          userId: currentUserId,
          isSharedIncoming: true,
          sharedOwnerId: row.owner_id,
          sharedOwnerName: owner?.name,
          sharedOwnerUsername: owner?.username,
          name: source?.name || 'Assinatura compartilhada',
          emoji: source?.emoji || '👥',
          category: source?.category || 'Compartilhado',
          logoUrl: source?.logoUrl || '',
          costAmount: Number(row.amount ?? linkedMember?.amount ?? source?.costAmount ?? 0),
          costCurrency: fallbackCurrency,
          billingCycle: source?.billingCycle || 'Monthly',
          dueDate: linkedMember?.paymentDate || source?.dueDate || 1,
          dueMonth: source?.billingCycle === 'Yearly' ? source?.dueMonth : undefined,
          paymentMethod: source?.paymentMethod || 'Outro',
          paymentSource: owner?.username ? `@${owner.username}` : owner?.name || 'Compartilhado',
          bankLogoUrl: '',
          notes: accessNote || (
            owner?.username
            ? `Compartilhado por @${owner.username}`
            : owner?.name
              ? `Compartilhado por ${owner.name}`
              : source?.notes
          ),
          hasIncome: false,
          incomeAmount: 0,
          incomeCurrency: fallbackCurrency,
          incomeFrequency: source?.billingCycle || 'Monthly',
          incomeSourceDescription: '',
          hasCashback: false,
          cashbackPercentage: 0,
          subItems: [],
          serviceUsername: shouldShareCredentials ? source?.serviceUsername : undefined,
          servicePassword: shouldShareCredentials ? source?.servicePassword : undefined,
          sharedWith: source?.sharedWith || [],
          status: paymentStatus === 'overdue' ? 'cancelled_temporary' : source?.status,
          createdAt: source?.createdAt || row.created_at,
          updatedAt: source?.updatedAt || row.created_at,
        });

        return sharedSubscription;
      });
  };

  const handleSave = async (sub: Subscription) => {
    setIsFormOpen(false);
    setEditingSub(undefined);

    try {
      await persistOwnedSubscription(sub, {
        successMessage: m('Item salvo!', 'Item saved!', 'Â¡Elemento guardado!', 'Elemento salvato!'),
        localOnlyMessage: m('Item salvo localmente', 'Item saved locally', 'Elemento guardado localmente', 'Elemento salvato in locale'),
      });
    } catch (error: any) {
      console.error('Save error', error);
      showToast(m('Item salvo localmente', 'Item saved locally', 'Elemento guardado localmente', 'Elemento salvato in locale'), false);
    }

    return;

    if (user) {
      try {
        const isNew = !subscriptions.find(s => s.id === sub.id);
        const fullSub = normalizeSubscription({
          ...sub,
          user_id: user.id,
          createdAt: isNew ? new Date().toISOString() : sub.createdAt,
          updatedAt: new Date().toISOString()
        });

        // 1. Always save locally FIRST (never lose data)
        const updated = isNew
          ? [...subscriptions, fullSub]
          : subscriptions.map((x: Subscription) => x.id === sub.id ? fullSub : x);
        setSubscriptions(updated);
        localStorage.setItem('subscriptions_' + user.id, JSON.stringify(updated));
        localStorage.setItem('subscriptions', JSON.stringify(updated));

        // 2. Supabase two-tier save
        const result = await saveToSupabase(
          [toSupabaseRow(fullSub, user.id)],
          [toMinimalSupabaseRow(fullSub, user.id)],
          [toMarketplaceCompatibleSupabaseRow(fullSub, user.id)]
        );
        if (result === 'fail') {
          showToast(m('Item salvo localmente', 'Item saved locally', 'Elemento guardado localmente', 'Elemento salvato in locale'), false);
        } else {
          showToast(m('Item salvo!', 'Item saved!', '¡Elemento guardado!', 'Elemento salvato!'), true);
        }

        // 3. Firebase (secondary) — silent
        setDoc(doc(db, 'subscriptions', fullSub.id), sanitizeForFirebase(fullSub) as any).catch(() => {});
      } catch (error: any) {
        console.error('Save error', error);
        showToast(m('Item salvo localmente', 'Item saved locally', 'Elemento guardado localmente', 'Elemento salvato in locale'), false);
      }
    } else {
      const normalizedSub = normalizeSubscription(sub);
      setSubscriptions(subs => subs.find(s => s.id === sub.id) ? subs.map(s => s.id === sub.id ? normalizedSub : s) : [...subs, normalizedSub]);
    }
    setIsFormOpen(false);
    setEditingSub(undefined);
  };

  const handleSetMemberPaid = async (subscriptionId: string, memberId: string, paid: boolean) => {
    const targetSubscription = subscriptions.find((subscription) => subscription.id === subscriptionId);
    if (!targetSubscription) return;

    const updatedSubscription = normalizeSubscription({
      ...targetSubscription,
      updatedAt: new Date().toISOString(),
      sharedWith: (targetSubscription.sharedWith || []).map((member) =>
        member.id === memberId ? withSharedMemberPaymentStatus(member, paid) : member
      ),
    });

    const updatedSubscriptions = subscriptions.map((subscription) =>
      subscription.id === subscriptionId ? updatedSubscription : subscription
    );

    setSubscriptions(updatedSubscriptions);
    localStorage.setItem('subscriptions', JSON.stringify(updatedSubscriptions));
    if (user) {
      localStorage.setItem('subscriptions_' + user.id, JSON.stringify(updatedSubscriptions));
      const result = await saveToSupabase(
        [toSupabaseRow(updatedSubscription, user.id)],
        [toMinimalSupabaseRow(updatedSubscription, user.id)],
        [toMarketplaceCompatibleSupabaseRow(updatedSubscription, user.id)]
      );
      if (result === 'fail') {
        showToast(m('Status salvo apenas localmente', 'Status saved locally only', 'Estado guardado solo localmente', 'Stato salvato solo in locale'), false);
      }
      setDoc(doc(db, 'subscriptions', updatedSubscription.id), sanitizeForFirebase(updatedSubscription) as any).catch(() => {});
    }
  };

  const handleLinkSharedUserToSubscription = async (
    subscriptionId: string,
    linkedUser: { id: string; name?: string; username: string },
    amount: number,
    currency: Currency,
    options: {
      shareCredentials: boolean;
      paymentMode: 'immediate' | 'bitcoin';
      paymentType: 'onetime' | 'monthly';
      bitcoinAmountSats: number;
    }
  ) => {
    if (!user) return;

    const targetSubscription = subscriptions.find((subscription) => subscription.id === subscriptionId);
    if (!targetSubscription) return;

    const existing = findSharedMemberForUser(
      targetSubscription.sharedWith,
      linkedUser.id,
      linkedUser.username
    );

    const remainingMembers = (targetSubscription.sharedWith || []).filter((member) => {
      const normalizedUsername = member.username?.replace('@', '').toLowerCase();
      return member.userId !== linkedUser.id && member.id !== linkedUser.id && normalizedUsername !== linkedUser.username.toLowerCase();
    });

    const mergedSharedWith = [
      ...remainingMembers,
      {
        ...existing,
        id: linkedUser.id,
        userId: linkedUser.id,
        username: linkedUser.username.toLowerCase(),
        name: linkedUser.name || existing?.name || linkedUser.username,
        amount,
        currency,
        paymentDate: existing?.paymentDate || targetSubscription.dueDate,
        info: existing?.info || '',
        accepted: false,
        shareCredentials: options.shareCredentials,
        paymentMode: options.paymentMode,
        paymentType: options.paymentType,
        bitcoinAmountSats: options.bitcoinAmountSats,
        paymentStatus: 'unpaid',
        credentialsUnlocked: false,
        guaranteeSats: options.paymentMode === 'bitcoin' && options.paymentType === 'monthly'
          ? options.bitcoinAmountSats
          : 0,
      },
    ];

    const incomeCurrency = targetSubscription.incomeCurrency || targetSubscription.costCurrency || currency;
    const totalSharedIncome = calculateConfirmedSharedIncome(
      mergedSharedWith as SharedMember[],
      incomeCurrency,
      (targetSubscription.costCurrency as Currency) || currency
    );

    const updatedSubscription = normalizeSubscription({
      ...targetSubscription,
      updatedAt: new Date().toISOString(),
      sharedWith: mergedSharedWith,
      hasIncome: mergedSharedWith.length > 0 || targetSubscription.hasIncome,
      incomeCurrency,
      incomeAmount: totalSharedIncome,
    });

    const updatedSubscriptions = subscriptions.map((subscription) =>
      subscription.id === subscriptionId ? updatedSubscription : subscription
    );

    setSubscriptions(updatedSubscriptions);
    localStorage.setItem('subscriptions', JSON.stringify(updatedSubscriptions));
    localStorage.setItem('subscriptions_' + user.id, JSON.stringify(updatedSubscriptions));
    hydrateUserSearchCache([linkedUser]);

    const optimisticFriend: FriendProfile = {
      id: linkedUser.id,
      name: linkedUser.name,
      username: linkedUser.username.toLowerCase(),
      createdAt: new Date().toISOString(),
    };

    setFriends((currentFriends) => {
      const nextFriends = [
        optimisticFriend,
        ...currentFriends.filter((friend) => friend.id !== linkedUser.id),
      ];
      writeFriendsCache(user.id, nextFriends);
      return nextFriends;
    });

    void (async () => {
      try {
        await withTimeout(
          upsertFriendships(user.id, [linkedUser.id]),
          3000,
          'Friend upsert timed out'
        );
      } catch (error) {
        console.error('[BoaWallet] Failed to create friendship during sharing', error);
      }

      try {
        const result = await withTimeout(
          saveToSupabase(
            [toSupabaseRow(updatedSubscription, user.id)],
            [toMinimalSupabaseRow(updatedSubscription, user.id)],
            [toMarketplaceCompatibleSupabaseRow(updatedSubscription, user.id)]
          ),
          5000,
          'Shared subscription sync timed out'
        );

        if (result === 'fail') {
          showToast(m('Participante salvo apenas localmente', 'Participant saved locally only', 'Participante guardado solo localmente', 'Partecipante salvato solo in locale'), false);
        }
      } catch (error) {
        console.error('[BoaWallet] Failed to sync linked shared member', error);
        showToast(m('Participante salvo apenas localmente', 'Participant saved locally only', 'Participante guardado solo localmente', 'Partecipante salvato solo in locale'), false);
      }

      setDoc(doc(db, 'subscriptions', updatedSubscription.id), sanitizeForFirebase(updatedSubscription) as any).catch(() => {});
      void refreshFriends(user.id);
    })();
  };

  const handleDelete = async (id: string) => {
    if (user) {
      const supaPromise = supabase.from('subscriptions').delete().eq('id', id).eq('user_id', user.id);
      const membersPromise = supabase.from('subscription_members').delete().eq('subscription_id', id).eq('owner_id', user.id);
      const firePromise = deleteDoc(doc(db, 'subscriptions', id));
      await Promise.allSettled([supaPromise, membersPromise, firePromise]);
    } else {
      setSubscriptions(subs => subs.filter(s => s.id !== id));
    }
    setSubToDelete(null);
  };

  const openEdit = (sub: Subscription) => {
    if (sub.isSharedIncoming) {
      showToast(m('Essa assinatura foi compartilhada com voce e nao pode ser editada aqui.', 'This shared subscription cannot be edited here.', 'Esta suscripcion compartida no se puede editar aqui.', 'Questo abbonamento condiviso non puo essere modificato qui.'), false);
      return;
    }
    setEditingSub(sub);
    setIsFormOpen(true);
  };
  const openNew  = () => { setEditingSub(undefined); setIsFormOpen(true); };

  // --- Export/Import ---
  const exportPDF = async () => {
    try {
      const QRCode = (await import('qrcode')).default;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = doc.internal.pageSize.width;   // 210
      const ph = doc.internal.pageSize.height;  // 297

      const olive    = [90,  90,  64]  as [number,number,number];
      const cream    = [208, 208, 160] as [number,number,number];
      const ink      = [18,  18,  18]  as [number,number,number];
      const muted    = [110, 110, 110] as [number,number,number];
      const white    = [255, 255, 255] as [number,number,number];
      const bg       = [248, 248, 244] as [number,number,number];
      const divider  = [220, 220, 210] as [number,number,number];

      // ── Header band ─────────────────────────────────────────────
      doc.setFillColor(...ink);
      doc.rect(0, 0, pw, 38, 'F');

      // Logo mark
      doc.setFillColor(...cream);
      doc.roundedRect(12, 8, 22, 22, 4, 4, 'F');
      doc.setTextColor(...ink);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('B', 23, 23, { align: 'center' });

      // App name + tagline
      doc.setTextColor(...cream);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Boa Wallet', 40, 20);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...muted);
      doc.text(language === 'pt' ? 'Gestor de assinaturas & carteira Bitcoin' :
               language === 'es' ? 'Gestor de suscripciones & cartera Bitcoin' :
               language === 'it' ? 'Gestore abbonamenti & portafoglio Bitcoin' :
               'Subscription manager & Bitcoin wallet', 40, 27);

      // Date right-aligned in header
      const dateStr = new Date().toLocaleDateString(
        language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : language === 'it' ? 'it-IT' : 'en-US',
        { year: 'numeric', month: 'long', day: 'numeric' }
      );
      doc.setTextColor(...muted);
      doc.setFontSize(7.5);
      doc.text(dateStr, pw - 12, 22, { align: 'right' });

      if (userName) {
        doc.setTextColor(180, 180, 150);
        doc.setFontSize(7);
        doc.text(userName, pw - 12, 29, { align: 'right' });
      }

      // ── Background ───────────────────────────────────────────────
      doc.setFillColor(...bg);
      doc.rect(0, 38, pw, ph - 38, 'F');

      // ── Summary cards ────────────────────────────────────────────
      const activeSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));
      const totalMonthly = activeSubs.reduce((sum, s) => {
        const cost = getEffectiveTotalCost(s);
        const converted = convertCurrency(cost.amount, cost.currency as Currency, baseCurrency, exchangeRates);
        const cycles: Record<string, number> = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1/3, semiannual: 1/6, annual: 1/12 };
        return sum + converted * (cycles[s.billingCycle] ?? 1);
      }, 0);

      const cardY = 44;
      const cardH = 20;
      const cardW = (pw - 30) / 3;
      const cards = [
        { label: language === 'pt' ? 'Assinaturas ativas' : language === 'es' ? 'Activas' : language === 'it' ? 'Attivi' : 'Active subs', value: String(activeSubs.length) },
        { label: language === 'pt' ? 'Gasto mensal' : language === 'es' ? 'Gasto mensual' : language === 'it' ? 'Spesa mensile' : 'Monthly spend', value: formatCurrency(totalMonthly, baseCurrency) },
        { label: language === 'pt' ? 'Gasto anual' : language === 'es' ? 'Gasto anual' : language === 'it' ? 'Spesa annuale' : 'Annual spend', value: formatCurrency(totalMonthly * 12, baseCurrency) },
      ];
      cards.forEach((card, i) => {
        const cx = 12 + i * (cardW + 3);
        doc.setFillColor(...white);
        doc.setDrawColor(...divider);
        doc.setLineWidth(0.3);
        doc.roundedRect(cx, cardY, cardW, cardH, 3, 3, 'FD');

        doc.setTextColor(...muted);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.text(card.label.toUpperCase(), cx + cardW / 2, cardY + 6.5, { align: 'center' });

        doc.setTextColor(...ink);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(card.value, cx + cardW / 2, cardY + 14.5, { align: 'center' });
      });

      // ── Table ────────────────────────────────────────────────────
      const tableStartY = cardY + cardH + 6;

      const categories: string[] = Array.from(new Set(activeSubs.map((s: Subscription) => s.category || (language === 'pt' ? 'Outros' : 'Other'))));
      const tableBody: (string | { content: string; styles: any })[][] = [];
      const catRowIndexes: number[] = [];

      for (const cat of categories) {
        const catSubs = activeSubs.filter(s => (s.category || (language === 'pt' ? 'Outros' : 'Other')) === cat);
        catRowIndexes.push(tableBody.length);
        tableBody.push([{ content: cat.toUpperCase(), styles: { fontStyle: 'bold', textColor: olive, fillColor: [244, 244, 238], colSpan: 3 } }]);
        for (const s of catSubs) {
          const cost = getEffectiveTotalCost(s);
          const convertedCost = convertCurrency(cost.amount, cost.currency as Currency, baseCurrency, exchangeRates);
          const cycleLabel = (() => {
            const cycles: Record<string, Record<string, string>> = {
              weekly:     { pt: 'Semanal',    es: 'Semanal',    it: 'Settimanale', en: 'Weekly' },
              biweekly:   { pt: 'Quinzenal',  es: 'Quincenal',  it: 'Bisettimanale', en: 'Biweekly' },
              monthly:    { pt: 'Mensal',     es: 'Mensual',    it: 'Mensile',     en: 'Monthly' },
              quarterly:  { pt: 'Trimestral', es: 'Trimestral', it: 'Trimestrale', en: 'Quarterly' },
              semiannual: { pt: 'Semestral',  es: 'Semestral',  it: 'Semestrale',  en: 'Semiannual' },
              annual:     { pt: 'Anual',      es: 'Anual',      it: 'Annuale',     en: 'Annual' },
            };
            return cycles[s.billingCycle]?.[language] ?? cycles[s.billingCycle]?.en ?? s.billingCycle ?? '—';
          })();
          tableBody.push([
            s.name,
            cycleLabel,
            formatCurrency(convertedCost, baseCurrency),
          ]);
        }
      }

      autoTable(doc, {
        startY: tableStartY,
        head: [[
          language === 'pt' ? 'Assinatura' : language === 'es' ? 'Suscripcion' : language === 'it' ? 'Abbonamento' : 'Subscription',
          language === 'pt' ? 'Ciclo' : language === 'es' ? 'Ciclo' : language === 'it' ? 'Ciclo' : 'Cycle',
          language === 'pt' ? 'Custo' : language === 'es' ? 'Costo' : language === 'it' ? 'Costo' : 'Cost',
        ]],
        body: tableBody,
        margin: { left: 12, right: 12 },
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
          textColor: ink,
        },
        headStyles: {
          fillColor: ink,
          textColor: cream,
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: [252, 252, 249] },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 32, halign: 'center' },
          2: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
        },
        tableLineColor: divider,
        tableLineWidth: 0.2,
      });

      // ── Footer ───────────────────────────────────────────────────
      const footerY = ph - 22;
      doc.setDrawColor(...divider);
      doc.setLineWidth(0.3);
      doc.line(12, footerY, pw - 12, footerY);

      // QR code — Play Store link
      const playStoreUrl = 'https://play.google.com/store/apps/details?id=io.boa.wallet';
      try {
        const qrDataUrl = await QRCode.toDataURL(playStoreUrl, { width: 80, margin: 1, color: { dark: '#121212', light: '#f8f8f4' } });
        const qrSize = 16;
        doc.addImage(qrDataUrl, 'PNG', pw - 12 - qrSize, footerY + 3, qrSize, qrSize);
        doc.setTextColor(...muted);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(language === 'pt' ? 'Baixar na Play Store' : language === 'es' ? 'Descargar en Play Store' : language === 'it' ? 'Scarica dal Play Store' : 'Get on Play Store', pw - 12 - qrSize / 2, footerY + 21, { align: 'center' });
      } catch {
        // QR failed silently — footer still renders
      }

      doc.setTextColor(...muted);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('boawallet.app', 12, footerY + 8);
      doc.setFontSize(6.5);
      doc.text(
        language === 'pt' ? `${activeSubs.length} assinaturas exportadas em ${dateStr}` :
        language === 'es' ? `${activeSubs.length} suscripciones exportadas el ${dateStr}` :
        language === 'it' ? `${activeSubs.length} abbonamenti esportati il ${dateStr}` :
        `${activeSubs.length} subscriptions exported on ${dateStr}`,
        12, footerY + 14
      );

      // ── Save / share ─────────────────────────────────────────────
      const filename = `boa-wallet-${new Date().toISOString().slice(0, 10)}.pdf`;
      if (Capacitor.isNativePlatform()) {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const result = await Filesystem.writeFile({ path: filename, data: pdfBase64, directory: Directory.Cache });
        await Share.share({ title: 'Boa Wallet', url: result.uri });
      } else {
        doc.save(filename);
      }
    } catch (err: any) {
      console.error('PDF generation error', err);
      showToast(language === 'pt' ? 'Erro na exportação para PDF!' : 'PDF Export Error!', false);
    }
  };

  const exportJSON = async () => {
    const data = JSON.stringify({
      app: 'BoaWallet',
      exportedAt: new Date().toISOString(),
      subscriptions,
      adjustments,
    }, null, 2);
    const exportFileName = `boa-wallet-export-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: exportFileName,
          data,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });
        await (Share as any).share({
          title: 'Boa Wallet Export',
          text: 'Boa Wallet Export',
          files: [result.uri],
          url: result.uri,
        });
      } else {
        const objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: objectUrl, download: exportFileName });
        a.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      showToast(m('JSON exportado com sucesso!', 'JSON exported successfully!', 'JSON exportado con exito!', 'JSON esportato con successo!'), true);
    } catch (err: any) {
      console.error('JSON export error', err);
      showToast(m('Erro ao exportar JSON', 'JSON export failed', 'Error al exportar JSON', 'Errore durante l esportazione JSON'), false);
    }
  };

  const importJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) throw new Error('Empty file');
        const data = JSON.parse(content);

        let subscriptionsToImport: any[] = [];
        if (Array.isArray(data)) {
          subscriptionsToImport = data;
        } else if (data.subscriptions && Array.isArray(data.subscriptions)) {
          subscriptionsToImport = data.subscriptions;
        } else {
          throw new Error('Invalid JSON structure: Expected an array or an object with a "subscriptions" key.');
        }
        const adjustmentsToImport = Array.isArray(data?.adjustments) ? data.adjustments : [];

        const normalized = subscriptionsToImport.map(s => normalizeSubscription(s));
        const normalizedAdjustments = adjustmentsToImport.map((adjustment: any) => ({
          id: String(adjustment.id || Date.now() + Math.random()),
          description: adjustment.description || '',
          subscriptionId: adjustment.subscriptionId,
          amount: Number(adjustment.amount) || 0,
          currency: adjustment.currency || 'BRL',
          month: Number(adjustment.month) || new Date().getMonth() + 1,
          year: Number(adjustment.year) || new Date().getFullYear(),
        }));

        // Detect duplicates by matching name + costAmount + costCurrency
        const duplicates: Subscription[] = [];
        const newItems: Subscription[] = [];
        for (const item of normalized) {
          const isDuplicate = subscriptions.some(existing =>
            existing.name.toLowerCase() === item.name.toLowerCase() &&
            existing.costAmount === item.costAmount &&
            existing.costCurrency === item.costCurrency
          );
          if (isDuplicate) {
            duplicates.push(item);
          } else {
            newItems.push(item);
          }
        }

        if (duplicates.length > 0) {
          // Show duplicate resolution modal — user picks which duplicates to include
          setImportDuplicates({ duplicates, newItems, adjustments: normalizedAdjustments, selected: new Set() });
        } else {
          // No duplicates — import everything directly
          await finalizeImport(normalized, normalizedAdjustments);
        }
      } catch (err: any) {
        console.error('Import error:', err);
        showToast(language === 'pt' ? 'Erro ao importar: ' + err.message : 'Import error: ' + err.message, false);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const finalizeImport = async (itemsToImport: Subscription[], adjustmentsToImport: Adjustment[]) => {
    const n = itemsToImport.length;
    if (n === 0 && adjustmentsToImport.length === 0) {
      showToast(m('Nenhum item novo para importar', 'No new items to import', 'No hay elementos nuevos', 'Nessun nuovo elemento'), false);
      return;
    }

    // Merge with existing subscriptions (keep existing, add new)
    const existingIds = new Set(subscriptions.map(s => s.id));
    const mergedSubs = [...subscriptions, ...itemsToImport.filter(s => !existingIds.has(s.id))];
    // For items with same id, update them
    const finalSubs = mergedSubs.map(s => {
      const imported = itemsToImport.find(i => i.id === s.id);
      return imported || s;
    });

    setSubscriptions(finalSubs);
    setAdjustments(prev => {
      const existingAdjIds = new Set(prev.map(a => a.id));
      return [...prev, ...adjustmentsToImport.filter(a => !existingAdjIds.has(a.id))];
    });
    localStorage.setItem('subscriptions', JSON.stringify(finalSubs));
    localStorage.setItem('boa_adjustments', JSON.stringify([...adjustments, ...adjustmentsToImport]));

    if (user) {
      const withUser = finalSubs.map(s => normalizeSubscription({ ...s, user_id: user.id, userId: user.id }));
      localStorage.setItem('subscriptions_' + user.id, JSON.stringify(withUser));
      localStorage.setItem('adjustments_' + user.id, JSON.stringify([...adjustments, ...adjustmentsToImport]));

      console.log('[BoaWallet] Pushing imported data to Cloud...');
      // Only push newly imported items to avoid overwriting
      const importedWithUser = itemsToImport.map(s => normalizeSubscription({ ...s, user_id: user.id, userId: user.id }));
      const result = await saveToSupabase(
        importedWithUser.map(s => toSupabaseRow(s, user.id)),
        importedWithUser.map(s => toMinimalSupabaseRow(s, user.id)),
        importedWithUser.map(s => toMarketplaceCompatibleSupabaseRow(s, user.id))
      );
      if (adjustmentsToImport.length > 0) {
        await supabase.from('adjustments').upsert(
          adjustmentsToImport.map((adjustment) => ({ ...adjustment, user_id: user.id }))
        );
      }

      if (result === 'ok' || result === 'partial') {
        showToast(m(`${n} itens importados!`, `${n} items imported!`, `${n} elementos importados!`, `${n} elementi importati!`), true);
      } else {
        showToast(m(`${n} itens salvos localmente`, `${n} items saved locally`, `${n} elementos guardados localmente`, `${n} elementi salvati in locale`), false);
      }

      importedWithUser.forEach(item => setDoc(doc(db, 'subscriptions', item.id), sanitizeForFirebase(item) as any).catch(() => {}));
    } else {
      showToast(m(`${n} itens importados!`, `${n} items imported!`, `${n} elementos importados!`, `${n} elementi importati!`), true);
    }
  };

  const ownedActiveSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));
  const receivedActiveSubs = receivedSubscriptions.filter(s => !s.status?.startsWith('cancelled'));
  const activeSubs = [...ownedActiveSubs, ...receivedActiveSubs];
  const disabledSubs = [
    ...subscriptions.filter(s => s.status?.startsWith('cancelled')),
    ...receivedSubscriptions.filter(s => s.status?.startsWith('cancelled')),
  ];
  const showInitialSyncLoader = !!user && syncLoading && subscriptions.length === 0 && receivedSubscriptions.length === 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-[#d0d0a0]/30">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={handleSecretClick}>
            <div className="w-12 h-12 bg-[#d0d0a0] rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
              <span className="text-[#0a0a0a] font-black text-2xl">B</span>
            </div>
            {/* Removed the Boa Wallet text title space to give more room for actions */}
          </div>

          <div className="flex items-center gap-2">
            {/* Lang */}
            <div className="relative">
              <button onClick={() => setShowLangPicker(!showLangPicker)} className="px-2 py-1.5 rounded-lg bg-[#1a1a1a] border border-gray-800 text-xs">
                {LANG_OPTIONS.find(l => l.code === language)?.flag}
              </button>
              {showLangPicker && (
                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[100px]">
                  {LANG_OPTIONS.map(o => (
                    <button key={o.code} onClick={() => { setLanguage(o.code as Language); setShowLangPicker(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-800 text-xs">{o.flag} {o.label}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Currency */}
            <div className="relative">
              <button onClick={() => setShowCurrencyPicker(!showCurrencyPicker)} className="px-2 py-1.5 rounded-lg bg-[#1a1a1a] border border-gray-800 text-xs font-medium flex items-center gap-1">
                <DollarSign size={14} /> {baseCurrency}
              </button>
              {showCurrencyPicker && (
                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl z-50 py-1 w-24 max-h-48 overflow-y-auto">
                  {CURRENCIES.map(c => (
                    <button key={c} onClick={() => { setBaseCurrency(c); setShowCurrencyPicker(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-800 text-xs">{c}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme Toggle Removed */}
            
            {/* User */}
            {authLoading ? (
              <div className="w-10 h-10 rounded-full border-2 border-[#d0d0a0]/30 border-t-[#d0d0a0] animate-spin" />
            ) : user ? (
              <div className="relative">
                <UserAvatar user={user} onClick={() => setShowProfileMenu(!showProfileMenu)} />
                {showProfileMenu && (
                  <div className="absolute right-0 top-full mt-2 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl z-50 py-2 min-w-[220px]">
                    {/* Username section */}
                    <div className="px-4 py-2 border-b border-gray-800 mb-1">
                      {userHandle ? (
                        <div>
                          <span className="text-[#d0d0a0] text-sm font-bold">@{userHandle}</span>
                          <p className="text-[10px] text-gray-500 mt-1">Username permanente vinculado ao seu UID</p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">Defina seu @username permanente</p>
                      )}
                      {!userHandle && (
                        <div className="mt-2 flex gap-1.5">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#d0d0a0] text-xs font-bold">@</span>
                            <input
                              value={pendingHandle}
                              onChange={e => { setPendingHandle(e.target.value.replace('@','')); setHandleError(''); }}
                              placeholder="username"
                              className="w-full bg-[#252525] border border-gray-700 rounded-lg pl-6 pr-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#d0d0a0]/50"
                            />
                          </div>
                          <button
                            disabled={handleSaving}
                            onClick={async () => {
                              setHandleSaving(true);
                              const res = await saveUserHandle(pendingHandle);
                              setHandleSaving(false);
                              if (res.ok) { setPendingHandle(''); showToast('@' + pendingHandle.replace('@','') + ' salvo permanentemente!', true); }
                              else { setHandleError(res.error || 'Erro'); }
                            }}
                            className="px-2.5 py-1.5 bg-[#d0d0a0] text-[#0a0a0a] rounded-lg text-xs font-bold disabled:opacity-50"
                          >
                            {handleSaving ? '...' : 'OK'}
                          </button>
                        </div>
                      )}
                      {handleError && <p className="text-red-400 text-[10px] mt-1">{handleError}</p>}
                    </div>
                    <button onClick={() => { setShowMarketplaceModal(true); setShowProfileMenu(false); }} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-gray-800"><Globe size={16} /> {m('Assinaturas publicas', 'Public subscriptions', 'Suscripciones publicas', 'Abbonamenti pubblici')}</button>
                    <button onClick={() => { setShowFriendsModal(true); setShowProfileMenu(false); }} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-gray-800"><Users size={16} /> {m('Amigos', 'Friends', 'Amigos', 'Amici')}</button>
                    <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-red-400 text-sm flex items-center gap-2 hover:bg-gray-800"><LogOut size={16} /> {m('Sair', 'Sign out', 'Cerrar sesión', 'Esci')}</button>
                  </div>
                )}
              </div>
            ) : loggingIn ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-xl text-sm text-gray-300">
                <div className="w-4 h-4 rounded-full border-2 border-gray-500 border-t-[#d0d0a0] animate-spin" />
                {loginMethod === 'web3'
                  ? m('Conectando carteira...', 'Connecting wallet...', 'Conectando wallet...', 'Connessione wallet...')
                  : m('Entrando...', 'Signing in...', 'Iniciando sesión...', 'Accesso...')}
              </div>
            ) : (
              <button
                onClick={() => { localStorage.removeItem('boa_welcome_skipped'); setWelcomeSkipped(false); }}
                className="px-4 py-2 bg-[#d0d0a0] text-[#0a0a0a] rounded-xl text-sm font-bold transition-transform active:scale-95"
              >
                {m('Entrar', 'Sign in', 'Entrar', 'Accedi')}
              </button>
            )}

            {/* Settings */}
            <div className="relative">
              <button onClick={() => setShowSettingsMenu(!showSettingsMenu)} className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-800 text-gray-400 hover:text-white transition-colors bg-[#1a1a1a]">
                <Settings size={18} />
              </button>
              {showSettingsMenu && (
                <div className="absolute right-0 top-full mt-2 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl z-50 py-2 w-48 text-sm">
                  <div className="px-3 pb-2 mb-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase">Exportação & Dados</div>
                  {user && (
                    <>
                      <button onClick={() => { setShowFriendsModal(true); setShowSettingsMenu(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-800"><Users size={16} className="text-[#d0d0a0]" /> {m('Amigos', 'Friends', 'Amigos', 'Amici')}</button>
                      <button onClick={() => { setShowMarketplaceModal(true); setShowSettingsMenu(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-800"><Globe size={16} className="text-[#d0d0a0]" /> {m('Assinaturas publicas', 'Public subscriptions', 'Suscripciones publicas', 'Abbonamenti pubblici')}</button>
                    </>
                  )}
                  <button onClick={() => { exportJSON(); setShowSettingsMenu(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-800"><Download size={16} className="text-[#d0d0a0]" /> Exportar JSON</button>
                  <label className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-800 cursor-pointer">
                    <Upload size={16} className="text-[#d0d0a0]" /> Importar JSON
                    <input type="file" onChange={(e) => { importJSON(e); setShowSettingsMenu(false); }} className="hidden" />
                  </label>
                  <button onClick={() => { exportPDF(); setShowSettingsMenu(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-800"><FileText size={16} className="text-red-500" /> Exportar PDF</button>
                </div>
              )}
            </div>

            <button onClick={openNew} className="bg-[#5A5A40] hover:bg-[#6c6c51] px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md ml-2 transition-transform hover:scale-105 active:scale-95 text-[#d0d0a0]">
              <Plus size={20} /> <span className="">Novo</span>
              </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        <div>
          <h2 className="text-4xl font-bold tracking-tight">{getGreeting()}</h2>
          <p className="text-gray-500 mt-2">{t('app.summary')}</p>
        </div>

        {showInitialSyncLoader && (
          <div className="bg-[#111] border border-gray-800 rounded-3xl py-6 px-5 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full border-2 border-[#d0d0a0]/30 border-t-[#d0d0a0] animate-spin shrink-0" />
            <div>
              <p className="text-white font-semibold text-sm">Carregando sua conta...</p>
              <p className="text-gray-500 text-xs mt-1">Estamos sincronizando assinaturas, usuarios e logos.</p>
            </div>
          </div>
        )}

        {/* TABS */}
        <div className="overflow-x-auto scrollbar-hide">
          <div className="inline-flex min-w-full gap-2 rounded-[24px] border border-gray-800 bg-[#111111]/85 p-2">
            {tabMeta.map(({ id, label, accent }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === id
                    ? accent
                      ? 'bg-[#d0d0a0] text-[#0a0a0a] shadow-[0_10px_30px_rgba(208,208,160,0.18)]'
                      : 'bg-white/[0.08] text-white'
                    : accent
                      ? 'text-[#d8d8b5] hover:bg-[#d0d0a0]/10'
                      : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-200'
                }`}
              >
                {label}
              </button>
          ))}
          </div>
        </div>

        {/* CONTENT */}
        {activeTab === 'overview' && (
          <div className="space-y-10">
            <Dashboard subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} adjustments={adjustments} onAddAdjustment={handleAddAdjustment} onRemoveAdjustment={handleRemoveAdjustment} />
            <SubscriptionList subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} onEdit={openEdit} onDelete={setSubToDelete} onToggleStatus={handleToggleStatus} onShare={user ? setShareSub : undefined} />
          </div>
        )}
        {activeTab === 'cashflow' && <Cashflow subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />}
        {activeTab === 'calendar' && <CalendarView subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} onEdit={openEdit} />}
        {activeTab === 'clients' && (
          <ClientsTab
            subscriptions={subscriptions}
            baseCurrency={baseCurrency}
            exchangeRates={exchangeRates}
            onEditSubscription={openEdit}
            onSetMemberPaid={handleSetMemberPaid}
          />
        )}
        {activeTab === 'shared' && (
          user
            ? <SharedWithMeTab
                userId={user.id}
                subscriptions={activeSubs}
                onShareWithUser={(u) => setShareTargetUser(u)}
              />
            : <div className="flex flex-col items-center py-20 gap-3 text-gray-500"><p className="text-sm">Faça login para ver assinaturas compartilhadas</p></div>
        )}
        {/* Bitcoin wallet tab removed */}
        {activeTab === 'history' && (
          <div className="opacity-70 grayscale-[0.5]">
            <SubscriptionList subscriptions={disabledSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} onEdit={openEdit} onDelete={setSubToDelete} onToggleStatus={handleToggleStatus} />
          </div>
        )}
      </main>

      {/* Modals */}
      {!userName && !user && !authLoading && !welcomeSkipped && (
        <WelcomeModal
          onSave={setUserName}
          onLogin={() => handleLogin('google')}
          onWeb3Login={canUseWeb3Login ? () => handleLogin('web3') : undefined}
          canUseWeb3Login={canUseWeb3Login}
          loggingIn={loggingIn}
          loginMethod={loginMethod}
          onSkip={() => {
            localStorage.setItem('boa_welcome_skipped', '1');
            setWelcomeSkipped(true);
          }}
        />
      )}
      {isFormOpen && <SubscriptionForm subscription={editingSub} onSave={handleSave} onClose={() => setIsFormOpen(false)} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />}
      {shareSub && user && (
        <ShareModal
          subscription={shareSub}
          currentUserId={user.id}
          preselectedUser={sharePreUser}
          onClose={() => { setShareSub(null); setSharePreUser(null); }}
          onShareLinkedMember={handleLinkSharedUserToSubscription}
          onShared={(msg) => { showToast(msg, true); setShareSub(null); setSharePreUser(null); }}
        />
      )}

      {/* Subscription picker — shown when user picked from Users tab */}
      {shareTargetUser && !shareSub && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl w-full sm:max-w-md max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
              <div>
                <h3 className="font-bold text-white text-sm">Qual assinatura compartilhar?</h3>
                <p className="text-xs text-gray-500 mt-0.5">com @{shareTargetUser.username}</p>
              </div>
              <button onClick={() => setShareTargetUser(null)} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white">
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {ownedActiveSubs.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-8">Nenhuma assinatura ativa</p>
              )}
              {ownedActiveSubs.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => { setShareSub(sub); setSharePreUser(shareTargetUser); setShareTargetUser(null); }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-[#252525] hover:bg-[#2a2a2a] border border-gray-800 rounded-2xl text-left active:scale-95 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-lg shrink-0">{sub.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{sub.name}</p>
                    <p className="text-gray-500 text-xs">{sub.costCurrency} {sub.costAmount}/mês</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFriendsModal && user && (
        <FriendsModal
          currentUserId={user.id}
          currentUsername={userHandle || undefined}
          currentName={userName || user.user_metadata?.full_name || undefined}
          friends={friends}
          loading={friendsLoading}
          onAddFriend={handleAddFriend}
          onShareSubscription={(friend) => {
            setShareTargetUser(friend);
            setShowFriendsModal(false);
          }}
          onClose={() => setShowFriendsModal(false)}
        />
      )}

      {showMarketplaceModal && user && (
        <PublicMarketplaceModal
          userId={user.id}
          onClose={() => setShowMarketplaceModal(false)}
        />
      )}
      
      {importDuplicates && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-2">{m('Itens duplicados encontrados', 'Duplicate items found', 'Elementos duplicados encontrados', 'Elementi duplicati trovati')}</h3>
            <p className="text-gray-400 text-sm mb-4">
              {m(
                `${importDuplicates.newItems.length} novo(s) + ${importDuplicates.duplicates.length} duplicado(s). Marque os duplicados que deseja incluir:`,
                `${importDuplicates.newItems.length} new + ${importDuplicates.duplicates.length} duplicate(s). Check duplicates to include:`,
                `${importDuplicates.newItems.length} nuevo(s) + ${importDuplicates.duplicates.length} duplicado(s). Marque los duplicados a incluir:`,
                `${importDuplicates.newItems.length} nuovo/i + ${importDuplicates.duplicates.length} duplicato/i. Seleziona i duplicati da includere:`
              )}
            </p>
            <div className="space-y-2 mb-5">
              {importDuplicates.duplicates.map(dup => (
                <label key={dup.id} className="flex items-center gap-3 p-3 bg-[#111] rounded-xl cursor-pointer hover:bg-[#1a1a1a] border border-gray-800">
                  <input
                    type="checkbox"
                    checked={importDuplicates.selected.has(dup.id)}
                    onChange={() => {
                      setImportDuplicates(prev => {
                        if (!prev) return prev;
                        const next = new Set(prev.selected);
                        if (next.has(dup.id)) next.delete(dup.id); else next.add(dup.id);
                        return { ...prev, selected: next };
                      });
                    }}
                    className="w-5 h-5 rounded accent-[#d0d0a0]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{dup.emoji} {dup.name}</div>
                    <div className="text-xs text-gray-500">{formatCurrency(dup.costAmount, dup.costCurrency)} / {dup.billingCycle}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setImportDuplicates(null)}
                className="flex-1 py-3 rounded-xl bg-gray-800 font-bold hover:bg-gray-700 text-sm"
              >{m('Cancelar', 'Cancel', 'Cancelar', 'Annulla')}</button>
              <button
                onClick={async () => {
                  const selectedDups = importDuplicates.duplicates.filter(d => importDuplicates.selected.has(d.id));
                  const allToImport = [...importDuplicates.newItems, ...selectedDups];
                  setImportDuplicates(null);
                  await finalizeImport(allToImport, importDuplicates.adjustments);
                }}
                className="flex-1 py-3 rounded-xl bg-[#d0d0a0] text-[#0a0a0a] font-bold hover:bg-[#c0c090] text-sm"
              >{m('Importar', 'Import', 'Importar', 'Importa')} ({importDuplicates.newItems.length + importDuplicates.selected.size})</button>
            </div>
          </div>
        </div>
      )}

      {subToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div>
            <h3 className="text-xl font-bold mb-2">Excluir Assinatura?</h3>
            <p className="text-gray-400 mb-8 text-sm">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-4">
              <button onClick={() => setSubToDelete(null)} className="flex-1 py-3 rounded-xl bg-gray-800 font-bold hover:bg-gray-700 transition-colors">Cancelar</button>
              <button onClick={() => handleDelete(subToDelete)} className="flex-1 py-3 rounded-xl bg-red-600 font-bold hover:bg-red-700 transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {disablePromptSub && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl p-8 max-w-sm w-full text-center">
            <h3 className="text-xl font-bold mb-4">Gerenciar {disablePromptSub.name}</h3>
            <div className="flex flex-col gap-3">
              <button onClick={() => confirmDisable('cancelled_temporary')} className="py-4 rounded-xl bg-orange-600 font-bold hover:bg-orange-700 transition-all">Pausa Temporária</button>
              <button onClick={() => confirmDisable('cancelled_permanent')} className="py-4 rounded-xl border border-[#5A5A40] text-gray-300 font-bold hover:bg-gray-800 transition-all">Cancelamento Permanente</button>
              <button onClick={() => { handleDelete(disablePromptSub.id); setDisablePromptSub(null); }} className="py-4 rounded-xl bg-red-900/50 text-red-400 border border-red-900 font-bold hover:bg-red-900/70 transition-all">Excluir Assinatura</button>
              <button onClick={() => setDisablePromptSub(null)} className="py-2 mt-2 text-gray-500 hover:text-white transition-colors">Voltar</button>
            </div>
          </div>
        </div>
      )}

      {renewalPromptSub && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl p-8 max-w-sm w-full text-center">
             <h3 className="text-xl font-bold mb-4">{renewalPromptSub.name}</h3>
             <p className="text-gray-400 mb-6 font-medium">Renovar automaticamente no próximo mês?</p>
             <div className="flex flex-col gap-3">
               <button onClick={() => handleRenewalAnswer(true)} className="py-4 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700 transition-all">Sim, renovar</button>
               <button onClick={() => handleRenewalAnswer(false)} className="py-4 rounded-xl bg-gray-800 font-bold hover:bg-gray-700 transition-all">Não, me lembre</button>
             </div>
          </div>
        </div>
      )}

      {showSecretMenu && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#151515] border border-gray-800 rounded-3xl p-8 max-w-sm w-full">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold">Menu Secreto</h3>
              <button onClick={() => setShowSecretMenu(false)} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">&times;</button>
            </div>
            <div className="space-y-3">
              <button onClick={exportJSON} className="w-full py-4 rounded-xl bg-[#1a1a1a] border border-gray-800 flex items-center gap-3 px-5 font-medium hover:bg-gray-800"><Download size={20} className="text-[#d0d0a0]" /> Exportar JSON</button>
              <label className="w-full py-4 rounded-xl bg-[#1a1a1a] border border-gray-800 flex items-center gap-3 px-5 font-medium hover:bg-gray-800 cursor-pointer">
                <Upload size={20} className="text-[#d0d0a0]" /> Importar JSON
                <input type="file" onChange={importJSON} className="hidden" />
              </label>
              <button
                onClick={async () => {
                  if (!user) {
                    showToast(m('Faça login para sincronizar', 'Please log in to sync', 'Inicia sesión para sincronizar', 'Accedi per sincronizzare'), false);
                    return;
                  }
                  showToast(m('Sincronizando...', 'Syncing...', 'Sincronizando...', 'Sincronizzazione...'));
                  try {
                    // Refresh session — avoids stale-token 401 errors
                    await supabase.auth.refreshSession().catch(() => {});

                    // Pull from Supabase (primary)
                    const { data: supaData, error: supaErr } = await supabase
                      .from('subscriptions').select('*').eq('user_id', user.id);
                    if (supaErr) throw new Error('Supabase: ' + supaErr.message);

                    const supaSubs = (supaData as any[]) || [];

                    // Pull from local cache as well
                    let localSubs: any[] = [];
                    try {
                      const raw = localStorage.getItem('subscriptions_' + user.id) || localStorage.getItem('subscriptions');
                      if (raw) localSubs = JSON.parse(raw);
                    } catch { /* ignore */ }

                    // Firebase (secondary, silent)
                    let fireSubs: any[] = [];
                    try {
                      const q = query(collection(db, 'subscriptions'), where('user_id', '==', user.id));
                      const snap = await getDocs(q);
                      snap.forEach(d => fireSubs.push({ ...d.data(), id: d.id }));
                    } catch { /* silent */ }

                    // Merge: local → firebase → supabase (Supabase wins)
                    const mergedMap = new Map();
                    localSubs.forEach((s: any) => mergedMap.set(s.id, s));
                    fireSubs.forEach(s => mergedMap.set(s.id, s));
                    supaSubs.forEach(s => mergedMap.set(s.id, s));
                    const merged = Array.from(mergedMap.values()).map(normalizeSubscription);

                    // Save locally
                    setSubscriptions(merged);
                    localStorage.setItem('subscriptions_' + user.id, JSON.stringify(merged));
                    localStorage.setItem('subscriptions', JSON.stringify(merged));

                    // Push merged back to cloud (two-tier)
                    if (merged.length > 0) {
                      const result = await saveToSupabase(
                        merged.map(s => toSupabaseRow(s, user.id)),
                        merged.map(s => toMinimalSupabaseRow(s, user.id)),
                        merged.map(s => toMarketplaceCompatibleSupabaseRow(s, user.id))
                      );
                      merged.forEach(item => setDoc(doc(db, 'subscriptions', item.id), sanitizeForFirebase(item) as any).catch(() => {}));
                      if (result === 'fail') throw new Error('Cloud push failed');
                    }
                    showToast(m(`Sincronizado! ${merged.length} itens`, `Synced! ${merged.length} items`, `¡Sincronizado! ${merged.length} elementos`, `Sincronizzato! ${merged.length} elementi`), true);
                  } catch (err: any) {
                    console.error('Manual sync failed', err);
                    showToast(m('Erro ao sincronizar. Tente novamente.', 'Sync failed. Please try again.', 'Error al sincronizar. Inténtalo de nuevo.', 'Sincronizzazione fallita. Riprova.'), false);
                  }
                }}
                className="w-full py-4 rounded-xl bg-[#1a1a1a] border border-gray-800 flex items-center gap-3 px-5 font-medium hover:bg-gray-800"
              >
                <Database size={20} className="text-emerald-500" /> Sincronizar Nuvem
              </button>
              <button onClick={exportPDF} className="w-full py-4 rounded-xl bg-[#1a1a1a] border border-gray-800 flex items-center gap-3 px-5 font-medium hover:bg-gray-800"><FileText size={20} className="text-red-500" /> Exportar PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop for click outside */}
      {(showLangPicker || showCurrencyPicker || showProfileMenu || showSettingsMenu) && <div className="fixed inset-0 z-30" onClick={() => { setShowLangPicker(false); setShowCurrencyPicker(false); setShowProfileMenu(false); setShowSettingsMenu(false); }} />}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-medium flex items-center gap-2 transition-all animate-in fade-in slide-in-from-bottom-4 ${toast.ok ? 'bg-emerald-900/90 border border-emerald-700 text-emerald-200' : 'bg-gray-900/95 border border-gray-700 text-gray-300'}`}>
          {toast.ok ? '✓' : '⚠'} {toast.msg}
        </div>
      )}
    </div>
  );
}
