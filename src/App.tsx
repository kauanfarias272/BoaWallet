import React, { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { SubscriptionList } from './components/SubscriptionList';
import { SubscriptionForm } from './components/SubscriptionForm';
import { WelcomeModal } from './components/WelcomeModal';
import { Cashflow } from './components/Cashflow';
import { ClientsTab } from './components/ClientsTab';
import { Currency, Subscription, Adjustment, getEffectiveTotalCost, convertCurrency, SharedMember, BillingCycle } from './types';
import { Plus, AlertTriangle, LogIn, LogOut, Download, Upload, FileText, Moon, Sun, ChevronDown, DollarSign, Zap, Database, Settings } from 'lucide-react';
import { useAppContext } from './AppContext';
import { useTranslation, Language } from './i18n';
import { supabase } from './supabase';
import { db, auth as firebaseAuth } from './firebase';
import { collection, query, where, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './lib/utils';

const LANG_OPTIONS = [
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'pt', label: 'PT', flag: '🇧🇷' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'it', label: 'IT', flag: '🇮🇹' }
];

const CURRENCIES: Currency[] = ['BRL','USD','EUR','GBP','JPY','TRY','ARS','INR','IDR','CAD','AUD','CHF','CNY','MXN','BTC','SATS'];

export default function App() {
  const { language, setLanguage, theme, setTheme, exchangeRates, userName, setUserName, gender, setGender, user, authLoading, setGoogleAccessToken } = useAppContext();
  const t = useTranslation(language);

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'cashflow' | 'calendar' | 'clients'>('overview');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
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
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const secretTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string, ok = true) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ msg, ok });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('baseCurrency', baseCurrency); }, [baseCurrency]);

  // Handle OAuth deep link callback (Android: io.boa.wallet://auth?code=...)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener('appUrlOpen', async (event) => {
      console.log('[BoaWallet] appUrlOpen:', event.url);
      if (event.url.startsWith('io.boa.wallet://auth')) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(event.url);
          if (error) {
            console.error('[BoaWallet] OAuth code exchange failed:', error.message);
            showToast('Login falhou: ' + error.message, false);
          } else if (data.session) {
            console.log('[BoaWallet] OAuth session established!', data.session.user.email);
            showToast('Login realizado com sucesso!', true);
          }
        } catch (e: any) {
          console.error('[BoaWallet] appUrlOpen error:', e);
        }
      }
    });
    return () => { listener.then(l => l.remove()); };
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
      supabase.from('users').upsert({
        id: user.id, email: user.email,
        name: user.user_metadata?.full_name || userName,
        language, base_currency: baseCurrency,
        updated_at: new Date().toISOString()
      });
    }
  }, [user, language, baseCurrency, userName]);

  useEffect(() => {
    if (!user) {
      try { 
        const s = localStorage.getItem('subscriptions'); if (s) setSubscriptions(JSON.parse(s)); 
        const a = localStorage.getItem('boa_adjustments'); if (a) setAdjustments(JSON.parse(a));
      } catch {}
      return;
    }

    const fetchInitialData = async () => {
      if (!user) return;
      console.log('[BoaWallet] Syncing data from cloud...');
      
      try {
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

          setSubscriptions(subs as any[]);
          localStorage.setItem('subscriptions_' + user.id, JSON.stringify(subs));
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
              setSubscriptions(fireSubs);
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
                   setSubscriptions(parsed);
                }
              }
            }
          } catch (err) { console.error('Firebase pull failed', err); }
        }

        const { data: adjs, error: adjsError } = await supabase.from('adjustments').select('*').eq('user_id', user.id);
        if (adjs && adjs.length > 0) {
          setAdjustments(adjs as any[]);
          localStorage.setItem('adjustments_' + user.id, JSON.stringify(adjs));
        }
      } catch (err) {
        console.error('[BoaWallet] Sync failed', err);
      }
    };

    fetchInitialData();

    const subsSubscription = supabase.channel('subs_v15_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` }, fetchInitialData).subscribe();

    const adjsSubscription = supabase.channel('adjs_v15_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'adjustments', filter: `user_id=eq.${user.id}` }, fetchInitialData).subscribe();

    return () => {
      supabase.removeChannel(subsSubscription);
      supabase.removeChannel(adjsSubscription);
    };
  }, [user]);

  // --- Auth ---
  const handleLogin = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Step 1: Try Firebase native Google sign-in (fastest, no browser redirect)
        let idToken: string | null = null;
        try {
          console.log('[BoaWallet] Trying Firebase native sign-in...');
          const result = await FirebaseAuthentication.signInWithGoogle();
          idToken = result.credential?.idToken || null;
        } catch (fbErr: any) {
          console.warn('[BoaWallet] Firebase native sign-in unavailable, will use browser OAuth:', fbErr.message);
        }

        if (idToken) {
          // Firebase worked — use idToken to create Supabase session
          console.log('[BoaWallet] Firebase token received, authenticating with Supabase...');

          // Also sync to Firebase Web SDK (for Firestore writes)
          try {
            const credential = GoogleAuthProvider.credential(idToken);
            await signInWithCredential(firebaseAuth, credential);
          } catch (fbSyncErr) {
            console.warn('[BoaWallet] Firebase web SDK sync failed (non-critical):', fbSyncErr);
          }

          const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
          if (error) {
            console.warn('[BoaWallet] signInWithIdToken failed, falling back to browser OAuth:', error.message);
            // Fall through to browser OAuth below
            idToken = null;
          } else {
            console.log('[BoaWallet] Supabase session established via Firebase token.');
            showToast('Login realizado!', true);
            return;
          }
        }

        // Step 2: Browser-based OAuth fallback (handles the deep link via appUrlOpen)
        console.log('[BoaWallet] Opening browser for Supabase OAuth...');
        showToast(language === 'pt' ? 'Abrindo login no navegador...' : 'Opening browser login...', true);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'io.boa.wallet://auth',
            skipBrowserRedirect: false,
          },
        });
        if (error) throw error;

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
      showToast(language === 'pt' ? 'Erro no login: ' + error.message : 'Login error: ' + error.message, false);
    }
  };

  const handleLogout = async () => {
    try {
      if (user) {
        localStorage.setItem('subscriptions_' + user.id, JSON.stringify(subscriptions));
        localStorage.setItem('adjustments_' + user.id, JSON.stringify(adjustments));
      }
      await supabase.auth.signOut();
      setUserName('');
      setSubscriptions([]);
      setAdjustments([]);
    } catch (error) { console.error('Logout error', error); }
  };
  
  // Only include columns that exist in the Supabase table — prevents "unknown column" errors
  const toSupabaseRow = (sub: Subscription, userId: string) => ({
    id: sub.id,
    user_id: userId,
    userId: (sub as any).userId || (sub as any).user_id || userId,
    name: sub.name,
    type: sub.type,
    emoji: sub.emoji,
    logoUrl: sub.logoUrl,
    bankLogoUrl: sub.bankLogoUrl,
    category: sub.category,
    notes: sub.notes,
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

    return {
      ...s,
      id: String(s.id || Date.now() + Math.random()),
      name: s.name || '',
      emoji: s.emoji || '📺',
      category: s.category || 'Outros',
      costAmount: parseFloat(s.costAmount) || 0,
      costCurrency: (s.costCurrency as Currency) || 'BRL',
      billingCycle: (s.billingCycle as BillingCycle) || 'Monthly',
      dueDate: parseInt(s.dueDate) || 1,
      createdAt: normalizeDate(s.createdAt),
      updatedAt: normalizeDate(s.updatedAt || s.createdAt),
      user_id: s.user_id || s.userId,
      userId: s.userId || s.user_id,
      subItems: (s.subItems || []).map((i: any) => ({
        id: String(i.id || Math.random()),
        name: i.name || '',
        costAmount: parseFloat(i.costAmount) || 0
      })),
      sharedWith: (s.sharedWith || []).map((m: any) => ({
        ...m,
        id: String(m.id || Math.random()),
        amount: parseFloat(m.amount) || 0,
        currency: (m.currency as Currency) || s.costCurrency || 'BRL'
      })),
      hasIncome: !!s.hasIncome,
      hasCashback: !!s.hasCashback,
      hasEarlyPayDiscount: !!s.hasEarlyPayDiscount,
      isPromotional: !!s.isPromotional
    } as Subscription;
  };

  const handleSave = async (sub: Subscription) => {
    if (user) {
      try {
        const isNew = !subscriptions.find(s => s.id === sub.id);
        const fullSub = normalizeSubscription({
          ...sub,
          user_id: user.id,
          createdAt: isNew ? new Date().toISOString() : sub.createdAt,
          updatedAt: new Date().toISOString()
        });

        // Optimistic update + local backup
        const updated = isNew
          ? [...subscriptions, fullSub]
          : subscriptions.map((x: Subscription) => x.id === sub.id ? fullSub : x);
        setSubscriptions(updated);
        localStorage.setItem('subscriptions_' + user.id, JSON.stringify(updated));

        // Supabase (primary) — strict row mapper prevents unknown-column errors
        const supaRow = toSupabaseRow(fullSub, user.id);
        const supaResult = await supabase.from('subscriptions').upsert(supaRow);
        if (supaResult.error) {
          console.error('[BoaWallet] Supabase save error:', supaResult.error);
          showToast(language === 'pt' ? 'Salvo localmente (falha na nuvem)' : 'Saved locally (cloud sync failed)', false);
        }

        // Firebase (secondary/legacy) — silent, only log
        setDoc(doc(db, 'subscriptions', fullSub.id), fullSub).catch(fbErr => {
          console.warn('[BoaWallet] Firebase secondary sync failed (non-critical):', fbErr);
        });
      } catch (error: any) {
        console.error('Save error', error);
        showToast(language === 'pt' ? 'Salvo localmente (erro de rede)' : 'Saved locally (network error)', false);
      }
    } else {
      setSubscriptions(subs => subs.find(s => s.id === sub.id) ? subs.map(s => s.id === sub.id ? sub : s) : [...subs, sub]);
    }
    setIsFormOpen(false);
    setEditingSub(undefined);
  };

  const handleDelete = async (id: string) => {
    if (user) {
      const supaPromise = supabase.from('subscriptions').delete().eq('id', id).eq('user_id', user.id);
      const firePromise = deleteDoc(doc(db, 'subscriptions', id));
      await Promise.allSettled([supaPromise, firePromise]);
    } else {
      setSubscriptions(subs => subs.filter(s => s.id !== id));
    }
    setSubToDelete(null);
  };

  const openEdit = (sub: Subscription) => { setEditingSub(sub); setIsFormOpen(true); };
  const openNew  = () => { setEditingSub(undefined); setIsFormOpen(true); };

  // --- Export/Import ---
  const exportPDF = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      doc.setFontSize(20);
      doc.text('Boa Wallet - Relatório v1.6.0', pageWidth / 2, 20, { align: 'center' });
      
      const activeSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));
      const data = activeSubs.map(s => [s.name, s.category, formatCurrency(getEffectiveTotalCost(s).amount, s.costCurrency)]);
      autoTable(doc, { head: [['Nome', 'Categoria', 'Custo']], body: data, startY: 30 });
      
      if (Capacitor.isNativePlatform()) {
         const pdfBase64 = doc.output('datauristring').split(',')[1];
         const result = await Filesystem.writeFile({
            path: 'boa-wallet-report.pdf',
            data: pdfBase64,
            directory: Directory.Documents
         });
         await Share.share({ title: 'Boa Wallet Report', url: result.uri });
      } else {
         doc.save('boa-wallet-report.pdf');
      }
    } catch (err: any) {
      console.error('PDF generation error', err);
      alert(language === 'pt' ? 'Erro na exportação para PDF!' : 'PDF Export Error!');
    }
  };

  const exportJSON = async () => {
    const data = JSON.stringify({ subscriptions, adjustments }, null, 2);
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.writeFile({ path: 'boa-wallet-export.json', data, directory: Directory.Documents, encoding: Encoding.UTF8 });
      await Share.share({ title: 'Boa Wallet Export', url: result.uri });
    } else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data],{type:'application/json'})), download:'boa-wallet-export.json' });
      a.click();
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

        const normalized = subscriptionsToImport.map(s => normalizeSubscription(s));
        
        setSubscriptions(normalized);
        localStorage.setItem('subscriptions', JSON.stringify(normalized));
        
        if (user) {
          console.log('[BoaWallet] Syncing imported data to Cloud...');
          // Use strict mapper to avoid unknown-column Supabase errors
          const supaRows = normalized.map(s => toSupabaseRow(s, user.id));
          const toUpload = normalized.map(s => ({ ...s, user_id: user.id, userId: user.id }));

          // Push to Supabase (strict columns only)
          const supaRes = await supabase.from('subscriptions').upsert(supaRows);

          if (supaRes.error) {
            console.error('[BoaWallet] Import Supabase error:', supaRes.error);
            showToast(language === 'pt' ? `${normalized.length} itens importados (falha parcial na nuvem)` : `${normalized.length} items imported (partial cloud sync failure)`, false);
          } else {
            showToast(language === 'pt' ? `${normalized.length} itens importados com sucesso!` : `${normalized.length} items imported successfully!`, true);
          }

          // Firebase (secondary) — silent
          toUpload.forEach(item => setDoc(doc(db, 'subscriptions', item.id), item).catch(() => {}));
          localStorage.setItem('subscriptions_' + user.id, JSON.stringify(toUpload));
        } else {
          showToast(language === 'pt' ? `${normalized.length} itens importados!` : `${normalized.length} items imported!`, true);
        }
      } catch (err: any) {
        console.error('Import error:', err);
        showToast(language === 'pt' ? 'Erro ao importar: ' + err.message : 'Import error: ' + err.message, false);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const activeSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));
  const disabledSubs = subscriptions.filter(s => s.status?.startsWith('cancelled'));

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
            {authLoading ? <div className="w-10 h-10 rounded-full border-2 border-[#d0d0a0]/30 border-t-[#d0d0a0] animate-spin" /> : user ? (
              <div className="relative">
                {user.user_metadata?.avatar_url || user.user_metadata?.picture ? (
                  <img src={user.user_metadata?.avatar_url || user.user_metadata?.picture} onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-10 h-10 rounded-full border border-gray-800 cursor-pointer object-cover" alt="User" referrerPolicy="no-referrer" />
                ) : (
                  <div onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold cursor-pointer">{(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}</div>
                )}
                {showProfileMenu && (
                  <div className="absolute right-0 top-full mt-2 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[140px]">
                    <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-red-400 text-sm flex items-center gap-2 hover:bg-gray-800"><LogOut size={16} /> Sair</button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={handleLogin} className="px-4 py-2 bg-[#d0d0a0] text-[#0a0a0a] rounded-xl text-sm font-bold transition-transform active:scale-95">Login</button>
            )}

            {/* Settings */}
            <div className="relative">
              <button onClick={() => setShowSettingsMenu(!showSettingsMenu)} className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-800 text-gray-400 hover:text-white transition-colors bg-[#1a1a1a]">
                <Settings size={18} />
              </button>
              {showSettingsMenu && (
                <div className="absolute right-0 top-full mt-2 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl z-50 py-2 w-48 text-sm">
                  <div className="px-3 pb-2 mb-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase">Exportação & Dados</div>
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
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        <div>
          <h2 className="text-4xl font-bold tracking-tight">{getGreeting()}</h2>
          <p className="text-gray-500 mt-2">{t('app.summary')}</p>
        </div>

        {/* TABS */}
        <div className="flex gap-8 border-b border-gray-800 overflow-x-auto scrollbar-hide">
          {(['overview','cashflow','calendar','clients','history'] as const).map(id => (
            <button key={id} onClick={() => setActiveTab(id)} className={`pb-3 text-sm font-medium transition-all relative ${activeTab === id ? 'text-[#d0d0a0]' : 'text-gray-500 hover:text-gray-300'}`}>
              {id.charAt(0).toUpperCase() + id.slice(1)}
              {activeTab === id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#d0d0a0] rounded-full" />}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        {activeTab === 'overview' && (
          <div className="space-y-10">
            <Dashboard subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} adjustments={adjustments} onAddAdjustment={handleAddAdjustment} onRemoveAdjustment={handleRemoveAdjustment} />
            <SubscriptionList subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} onEdit={openEdit} onDelete={setSubToDelete} onToggleStatus={handleToggleStatus} />
          </div>
        )}
        {activeTab === 'cashflow' && <Cashflow subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />}
        {activeTab === 'calendar' && <CalendarView subscriptions={subscriptions} baseCurrency={baseCurrency} exchangeRates={exchangeRates} onEdit={openEdit} />}
        {activeTab === 'clients' && <ClientsTab subscriptions={subscriptions} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />}
        {activeTab === 'history' && (
          <div className="opacity-70 grayscale-[0.5]">
            <SubscriptionList subscriptions={disabledSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} onEdit={openEdit} onDelete={setSubToDelete} onToggleStatus={handleToggleStatus} />
          </div>
        )}
      </main>

      {/* Modals */}
      {!userName && !user && !authLoading && <WelcomeModal onSave={setUserName} onLogin={handleLogin} />}
      {isFormOpen && <SubscriptionForm subscription={editingSub} onSave={handleSave} onClose={() => setIsFormOpen(false)} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />}
      
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
                    showToast(language === 'pt' ? 'Faça login para sincronizar' : 'Login to sync', false);
                    return;
                  }
                  showToast(language === 'pt' ? 'Sincronizando...' : 'Syncing...');
                  try {
                    // Refresh session first to avoid stale-token errors
                    await supabase.auth.refreshSession();

                    const { data: supaData, error: supaErr } = await supabase
                      .from('subscriptions').select('*').eq('user_id', user.id);

                    if (supaErr) throw supaErr;

                    const supaSubs = (supaData as any[]) || [];
                    // Firebase fetch (secondary, silent)
                    let fireSubs: any[] = [];
                    try {
                      const q = query(collection(db, 'subscriptions'), where('user_id', '==', user.id));
                      const snap = await getDocs(q);
                      snap.forEach(d => fireSubs.push({ ...d.data(), id: d.id }));
                    } catch { /* silent */ }

                    const mergedMap = new Map();
                    fireSubs.forEach(s => mergedMap.set(s.id, s));
                    supaSubs.forEach(s => mergedMap.set(s.id, s)); // Supabase wins
                    const merged = Array.from(mergedMap.values()).map(normalizeSubscription);

                    setSubscriptions(merged);
                    localStorage.setItem('subscriptions_' + user.id, JSON.stringify(merged));

                    if (merged.length > 0) {
                      const rows = merged.map(s => toSupabaseRow(s, user.id));
                      await supabase.from('subscriptions').upsert(rows);
                      merged.forEach(item => setDoc(doc(db, 'subscriptions', item.id), item).catch(() => {}));
                    }
                    showToast(language === 'pt' ? `Sincronizado! ${merged.length} itens` : `Synced! ${merged.length} items`, true);
                  } catch (err: any) {
                    console.error('Manual sync failed', err);
                    showToast(language === 'pt' ? 'Erro: ' + err.message : 'Error: ' + err.message, false);
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
