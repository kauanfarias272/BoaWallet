import React, { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { SubscriptionList } from './components/SubscriptionList';
import { SubscriptionForm } from './components/SubscriptionForm';
import { WelcomeModal } from './components/WelcomeModal';
import { Cashflow } from './components/Cashflow';
import { ClientsTab } from './components/ClientsTab';
import { Currency, Subscription, Adjustment, getEffectiveTotalCost, convertCurrency, SharedMember } from './types';
import { Plus, AlertTriangle, LogIn, LogOut, Download, Upload, FileText, Moon, Sun, ChevronDown, DollarSign, Zap, Database } from 'lucide-react';
import { useAppContext } from './AppContext';
import { useTranslation, Language } from './i18n';
import { supabase } from './supabase';
import {
  saveSubscription as cloudSaveSubscription,
  deleteSubscription as cloudDeleteSubscription,
  saveAdjustment as cloudSaveAdjustment,
  deleteAdjustment as cloudDeleteAdjustment,
  pullAll,
  pushAll,
  migrateLegacyFlatSubscriptions,
} from './lib/cloudSync';
import { Capacitor } from '@capacitor/core';
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
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const secretTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('baseCurrency', baseCurrency); }, [baseCurrency]);

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
    localStorage.setItem('boa_adjustments', JSON.stringify(updated));

    if (user) {
      try {
        await cloudSaveAdjustment(user.id, newAdj);
      } catch (error) {
        console.error('Error adding adjustment:', error);
      }
    }
  };

  const handleRemoveAdjustment = async (id: string) => {
    const updated = adjustments.filter(a => a.id !== id);
    setAdjustments(updated);
    localStorage.setItem('boa_adjustments', JSON.stringify(updated));

    if (user) {
      try {
        await cloudDeleteAdjustment(user.id, id);
      } catch (error) {
        console.error('Error removing adjustment:', error);
      }
    }
  };

  // --- Synchronization: mirror the user profile (best-effort). ---
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { error } = await supabase.from('users').upsert({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || userName,
          language,
          base_currency: baseCurrency,
          updated_at: new Date().toISOString(),
        });
        if (error) console.warn('[BoaWallet] user profile mirror failed:', error.message);
      } catch (e) { console.warn('[BoaWallet] user profile mirror threw:', e); }
    })();
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
        // 1. Pull from both Firebase (primary) + Supabase (mirror), merged.
        const pulled = await pullAll(user.id);
        let subs = pulled.subscriptions;
        let adjs = pulled.adjustments;

        // 2. Migrate legacy flat Firestore collection once.
        if (subs.length === 0) {
          const legacy = await migrateLegacyFlatSubscriptions(user.id);
          if (legacy.length > 0) {
            console.log('[BoaWallet] Migrating legacy flat subs:', legacy.length);
            await pushAll(user.id, legacy, []);
            subs = legacy;
          }
        }

        // 3. Merge unsynced local entries into the cloud.
        try {
          const localRaw = localStorage.getItem('subscriptions_' + user.id) || localStorage.getItem('subscriptions');
          if (localRaw) {
            const localSubs = JSON.parse(localRaw);
            if (Array.isArray(localSubs) && localSubs.length > 0) {
              const missing = localSubs.filter((ls: any) => ls?.id && !subs.some(s => s.id === ls.id));
              if (missing.length > 0) {
                console.log('[BoaWallet] Pushing unsynced local subs:', missing.length);
                await pushAll(user.id, missing, []);
                subs = [...subs, ...missing];
              }
            }
          }
          const localAdjRaw = localStorage.getItem('boa_adjustments');
          if (localAdjRaw) {
            const localAdjs = JSON.parse(localAdjRaw);
            if (Array.isArray(localAdjs) && localAdjs.length > 0) {
              const missing = localAdjs.filter((la: any) => la?.id && !adjs.some(a => a.id === la.id));
              if (missing.length > 0) {
                await pushAll(user.id, [], missing);
                adjs = [...adjs, ...missing];
              }
            }
          }
        } catch (e) { console.warn('Local merge failed', e); }

        // 4. Commit to UI + cache.
        setSubscriptions(subs);
        setAdjustments(adjs);
        localStorage.setItem('subscriptions_' + user.id, JSON.stringify(subs));
        localStorage.setItem('adjustments_' + user.id, JSON.stringify(adjs));
      } catch (err) {
        console.error('[BoaWallet] Sync failed', err);
      }
    };

    fetchInitialData();

    // Supabase realtime (best effort — ignore errors if table schema differs).
    const subsSubscription = supabase.channel('subs_v17_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` }, fetchInitialData).subscribe();
    const adjsSubscription = supabase.channel('adjs_v17_' + user.id)
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
        try {
          console.log('[BoaWallet] Starting native sign-in...');
          const result = await FirebaseAuthentication.signInWithGoogle();
          const idToken = result.credential?.idToken;
          
          if (idToken) {
            console.log('[BoaWallet] Native sign-in success, sending token to Supabase...');
            const { error } = await supabase.auth.signInWithIdToken({ 
              provider: 'google', 
              token: idToken 
            });
            if (error) throw error;
            console.log('[BoaWallet] Supabase session established.');
            return;
          } else {
            throw new Error('No idToken received from native sign-in.');
          }
        } catch (nativeError: any) {
          console.warn('[BoaWallet] Native sign-in failed, checking fallback...', nativeError);
          
          // Browser fallback - IMPORTANT: Redirect flow depends on having 'Client Secret' in Supabase
          // If the user gets 400 'missing OAuth secret', it's because Supabase provider is not configured with secret.
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { 
              redirectTo: 'io.boa.wallet://auth', 
              skipBrowserRedirect: false 
            }
          });
          if (error) {
            if (error.message.includes('OAuth secret')) {
              alert(language === 'pt' 
                ? 'Atenção: O login via navegador não está configurado no painel Supabase (Falta o OAuth Secret). Por favor, use o Google Play Services ou atualize sua configuração.' 
                : 'Warning: Browser login is not configured in Supabase (OAuth Secret missing). Please use Google Play Services or update your dashboard.');
            } else {
              throw error;
            }
          }
          return;
        }
      } else {
        // Web Platform
        const { error } = await supabase.auth.signInWithOAuth({ 
          provider: 'google', 
          options: { redirectTo: window.location.origin } 
        });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('[BoaWallet] Fatal login error', error);
      alert(language === 'pt' ? 'Erro crítico de login: ' + error.message : 'Critical login error: ' + error.message);
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

  const handleSave = async (sub: Subscription) => {
    const isNew = !subscriptions.find(s => s.id === sub.id);
    const nowIso = new Date().toISOString();
    const fullSub: Subscription = {
      ...sub,
      createdAt: isNew ? (Date.now()) : (sub.createdAt ?? Date.now()),
      // Tag updatedAt via spread so jsonb fallback preserves it; kept as any-cast.
    } as Subscription;
    (fullSub as any).updatedAt = nowIso;

    // Optimistic local update always.
    setSubscriptions(prev =>
      prev.find(s => s.id === fullSub.id)
        ? prev.map(s => (s.id === fullSub.id ? fullSub : s))
        : [...prev, fullSub]
    );

    if (user) {
      try {
        await cloudSaveSubscription(user.id, fullSub);
      } catch (error) {
        console.error('Save error', error);
        alert(language === 'pt' ? 'Erro ao salvar na nuvem, mas os dados estão salvos localmente.' : 'Could not save to cloud, but data is saved locally.');
      }
      // Always refresh the local cache.
      const next = subscriptions.find(s => s.id === fullSub.id)
        ? subscriptions.map(s => (s.id === fullSub.id ? fullSub : s))
        : [...subscriptions, fullSub];
      localStorage.setItem('subscriptions_' + user.id, JSON.stringify(next));
    } else {
      const next = subscriptions.find(s => s.id === fullSub.id)
        ? subscriptions.map(s => (s.id === fullSub.id ? fullSub : s))
        : [...subscriptions, fullSub];
      localStorage.setItem('subscriptions', JSON.stringify(next));
    }

    setIsFormOpen(false);
    setEditingSub(undefined);
  };

  const handleDelete = async (id: string) => {
    // Optimistic local delete regardless of auth.
    setSubscriptions(prev => prev.filter(s => s.id !== id));
    if (user) {
      try {
        await cloudDeleteSubscription(user.id, id);
        const next = subscriptions.filter(s => s.id !== id);
        localStorage.setItem('subscriptions_' + user.id, JSON.stringify(next));
      } catch (err) {
        console.error('Delete error', err);
        alert(language === 'pt' ? 'Erro ao excluir na nuvem, mas foi removido localmente.' : 'Could not delete from cloud, but removed locally.');
      }
    } else {
      const next = subscriptions.filter(s => s.id !== id);
      localStorage.setItem('subscriptions', JSON.stringify(next));
    }
    setSubToDelete(null);
  };

  const openEdit = (sub: Subscription) => { setEditingSub(sub); setIsFormOpen(true); };
  const openNew  = () => { setEditingSub(undefined); setIsFormOpen(true); };

  // --- Export/Import ---
  // jsPDF's default fonts only support Latin-1; emojis and other unicode glyphs
  // throw "WinAnsi encoding" errors. Strip them before rendering.
  const sanitizeForPdf = (text: string): string => {
    if (text == null) return '';
    const s = String(text);
    // Remove emoji ranges + any char outside printable ASCII / Latin-1.
    return s
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
      .trim();
  };

  const exportPDF = async () => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.width;
      pdf.setFontSize(18);
      pdf.text('Boa Wallet - Relatorio v1.7.0', pageWidth / 2, 20, { align: 'center' });
      pdf.setFontSize(10);
      pdf.text(new Date().toLocaleString(), pageWidth / 2, 27, { align: 'center' });

      const activeSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));
      const disabled = subscriptions.filter(s => s.status?.startsWith('cancelled'));

      const body = activeSubs.map(s => [
        sanitizeForPdf(s.name),
        sanitizeForPdf(s.category),
        sanitizeForPdf(s.billingCycle === 'Yearly' ? 'Anual' : 'Mensal'),
        String(s.dueDate ?? ''),
        sanitizeForPdf(s.paymentSource || ''),
        formatCurrency(getEffectiveTotalCost(s).amount, s.costCurrency),
      ]);
      autoTable(pdf, {
        head: [['Nome', 'Categoria', 'Ciclo', 'Dia', 'Origem', 'Custo']],
        body,
        startY: 34,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [90, 90, 64] },
      });

      if (disabled.length > 0) {
        const y = (pdf as any).lastAutoTable?.finalY ?? 34;
        pdf.setFontSize(12);
        pdf.text('Desabilitadas', 14, y + 12);
        autoTable(pdf, {
          head: [['Nome', 'Categoria', 'Status', 'Custo']],
          body: disabled.map(s => [
            sanitizeForPdf(s.name),
            sanitizeForPdf(s.category),
            s.status === 'cancelled_permanent' ? 'Cancelada' : 'Pausada',
            formatCurrency(getEffectiveTotalCost(s).amount, s.costCurrency),
          ]),
          startY: y + 16,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [120, 60, 60] },
        });
      }

      // Export: on web trigger download; on native write to filesystem and share.
      if (Capacitor.isNativePlatform()) {
        const base64 = pdf.output('datauristring').split(',')[1];
        const res = await Filesystem.writeFile({
          path: 'boa-wallet-report.pdf',
          data: base64,
          directory: Directory.Documents,
        });
        await Share.share({ title: 'Boa Wallet Report', url: res.uri });
      } else {
        pdf.save('boa-wallet-report.pdf');
      }
    } catch (err: any) {
      console.error('PDF generation error', err);
      alert((language === 'pt' ? 'Erro na exportação para PDF: ' : 'PDF Export Error: ') + (err?.message || err));
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
        
        if (data.subscriptions && Array.isArray(data.subscriptions)) {
          const normalized: Subscription[] = data.subscriptions.map((s: any) => ({
             ...s,
             id: s.id || Date.now().toString() + Math.random(),
             sharedWith: (s.sharedWith || []).map((m: any) => ({
                ...m,
                id: m.id || Date.now().toString() + Math.random(),
                amount: m.amount || 0,
                currency: m.currency || s.costCurrency || 'BRL',
                info: m.info || ''
             }))
          }));
          const normalizedAdjs: Adjustment[] = Array.isArray(data.adjustments) ? data.adjustments : [];

          setSubscriptions(normalized);
          if (normalizedAdjs.length > 0) setAdjustments(normalizedAdjs);
          localStorage.setItem('subscriptions', JSON.stringify(normalized));
          localStorage.setItem('boa_adjustments', JSON.stringify(normalizedAdjs));

          if (user) {
            console.log('[BoaWallet] Syncing imported data to Cloud...');
            try {
              await pushAll(user.id, normalized, normalizedAdjs);
              localStorage.setItem('subscriptions_' + user.id, JSON.stringify(normalized));
              localStorage.setItem('adjustments_' + user.id, JSON.stringify(normalizedAdjs));
            } catch (e) {
              console.error('Cloud import sync failed', e);
            }
          }
          alert(language === 'pt' ? 'Importação concluída com sucesso!' : 'Import successful!');
        } else {
          throw new Error('Invalid JSON structure');
        }
      } catch (err: any) { 
        console.error('Import error:', err);
        alert(language === 'pt' ? 'Erro ao importar arquivo: ' + err.message : 'Error importing file: ' + err.message); 
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
      {isFormOpen && <SubscriptionForm subscription={editingSub} onSave={handleSave} onClose={() => setIsFormOpen(false)} />}
      
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
            <h3 className="text-xl font-bold mb-4">Desabilitar {disablePromptSub.name}</h3>
            <div className="flex flex-col gap-3">
              <button onClick={() => confirmDisable('cancelled_temporary')} className="py-4 rounded-xl bg-orange-600 font-bold hover:bg-orange-700 transition-all">Pausa Temporária</button>
              <button onClick={() => confirmDisable('cancelled_permanent')} className="py-4 rounded-xl bg-red-900/50 text-red-400 border border-red-900 font-bold hover:bg-red-900/70 transition-all">Cancelamento Permanente</button>
              <button onClick={() => setDisablePromptSub(null)} className="py-2 text-gray-500 hover:text-white transition-colors">Voltar</button>
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
                    alert(language === 'pt' ? 'Faça login para sincronizar' : 'Login to sync');
                    return;
                  }
                  try {
                    // 1. Pull both sources, merge.
                    const pulled = await pullAll(user.id);

                    // 2. Merge with current in-memory state so local edits aren't lost.
                    const mergedSubs = new Map<string, Subscription>();
                    pulled.subscriptions.forEach(s => mergedSubs.set(s.id, s));
                    subscriptions.forEach(s => mergedSubs.set(s.id, s)); // local wins
                    const mergedAdjs = new Map<string, Adjustment>();
                    pulled.adjustments.forEach(a => mergedAdjs.set(a.id, a));
                    adjustments.forEach(a => mergedAdjs.set(a.id, a));

                    const finalSubs = Array.from(mergedSubs.values());
                    const finalAdjs = Array.from(mergedAdjs.values());

                    // 3. Push the merged set back to BOTH stores.
                    await pushAll(user.id, finalSubs, finalAdjs);

                    // 4. Refresh UI + cache.
                    setSubscriptions(finalSubs);
                    setAdjustments(finalAdjs);
                    localStorage.setItem('subscriptions_' + user.id, JSON.stringify(finalSubs));
                    localStorage.setItem('adjustments_' + user.id, JSON.stringify(finalAdjs));

                    alert(language === 'pt' ? 'Sincronização completa!' : 'Sync complete!');
                  } catch (err) {
                    console.error('Manual sync failed', err);
                    alert(language === 'pt' ? 'Erro ao sincronizar' : 'Sync error');
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
      {(showLangPicker || showCurrencyPicker || showProfileMenu) && <div className="fixed inset-0 z-30" onClick={() => { setShowLangPicker(false); setShowCurrencyPicker(false); setShowProfileMenu(false); }} />}
    </div>
  );
}
