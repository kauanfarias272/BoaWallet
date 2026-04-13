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
import { db } from './firebase';
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import jsPDF from 'jspdf';
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
      console.log('[BoaWallet] Syncing data...');
      
      const { data: subs, error: subsError } = await supabase.from('subscriptions').select('*').eq('user_id', user.id);
      
      if (subs && subs.length > 0) {
        setSubscriptions(subs as any[]);
        localStorage.setItem('subscriptions_' + user.id, JSON.stringify(subs));
      } else if (!subsError) {
        // Try Firebase Migration
        try {
          const q = query(collection(db, 'subscriptions'), where('user_id', '==', user.id));
          const querySnapshot = await getDocs(q);
          const fireSubs: any[] = [];
          querySnapshot.forEach((doc) => { fireSubs.push({ ...doc.data(), id: doc.id }); });
          
          if (fireSubs.length > 0) {
            setSubscriptions(fireSubs);
            for (const sub of fireSubs) { await supabase.from('subscriptions').upsert({ ...sub, user_id: user.id }); }
          } else {
            const cachedSubs = localStorage.getItem('subscriptions_' + user.id);
            if (cachedSubs) {
              const parsed = JSON.parse(cachedSubs);
              if (Array.isArray(parsed)) setSubscriptions(parsed);
            }
          }
        } catch (err) { console.error('Firebase pull failed', err); }
      }

      const { data: adjs, error: adjsError } = await supabase.from('adjustments').select('*').eq('user_id', user.id);
      if (adjs && adjs.length > 0) {
        setAdjustments(adjs as any[]);
        localStorage.setItem('adjustments_' + user.id, JSON.stringify(adjs));
      } else if (!adjsError) {
        const cachedAdjs = localStorage.getItem('adjustments_' + user.id);
        if (cachedAdjs) {
          const parsed = JSON.parse(cachedAdjs);
          if (Array.isArray(parsed)) setAdjustments(parsed);
        }
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
        try {
          const result = await FirebaseAuthentication.signInWithGoogle();
          const idToken = result.credential?.idToken;
          if (idToken) {
            const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
            if (error) throw error;
            return;
          }
        } catch (nativeError) {
          console.warn('Native sign-in error, using browser fallback', nativeError);
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: 'io.boa.wallet://auth', skipBrowserRedirect: false }
          });
          if (error) throw error;
          if (data?.url) window.open(data.url, '_system');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('Login error', error);
      alert(language === 'pt' ? 'Erro de login: ' + error.message : 'Login error: ' + error.message);
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
    if (user) {
      try {
        const isNew = !subscriptions.find(s => s.id === sub.id);
        const fullSub = {
          ...sub,
          user_id: user.id,
          createdAt: isNew ? new Date().toISOString() : sub.createdAt,
          updatedAt: new Date().toISOString()
        };
        // Optimistic
        if (isNew) setSubscriptions(s => [...s, fullSub as any]);
        else setSubscriptions(s => s.map(x => x.id === sub.id ? (fullSub as any) : x));

        await supabase.from('subscriptions').upsert(fullSub);
      } catch (error) { console.error('Save error', error); }
    } else {
      setSubscriptions(subs => subs.find(s => s.id === sub.id) ? subs.map(s => s.id === sub.id ? sub : s) : [...subs, sub]);
    }
    setIsFormOpen(false);
    setEditingSub(undefined);
  };

  const handleDelete = async (id: string) => {
    if (user) await supabase.from('subscriptions').delete().eq('id', id).eq('user_id', user.id);
    else setSubscriptions(subs => subs.filter(s => s.id !== id));
    setSubToDelete(null);
  };

  const openEdit = (sub: Subscription) => { setEditingSub(sub); setIsFormOpen(true); };
  const openNew  = () => { setEditingSub(undefined); setIsFormOpen(true); };

  // --- Export/Import ---
  const exportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(20);
    doc.text('Boa Wallet - Relat\u00f3rio v1.5.0', pageWidth / 2, 20, { align: 'center' });
    
    const activeSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));
    const data = activeSubs.map(s => [s.name, s.category, formatCurrency(getEffectiveTotalCost(s).amount, s.costCurrency)]);
    autoTable(doc, { head: [['Nome', 'Categoria', 'Custo']], body: data, startY: 30 });
    doc.save('boa-wallet-report.pdf');
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
        const data = JSON.parse(e.target?.result as string);
        if (data.subscriptions) {
          const normalized = data.subscriptions.map((s: any) => ({
             ...s,
             sharedWith: (s.sharedWith || []).map((m: any) => ({
                ...m,
                amount: m.amount || 0,
                currency: m.currency || s.costCurrency || 'BRL',
                info: m.info || ''
             }))
          }));
          setSubscriptions(normalized);
          if (user) await supabase.from('subscriptions').upsert(normalized.map((s: any) => ({ ...s, user_id: user.id })));
        }
        alert('Sucesso!');
      } catch (err) { alert('Erro no arquivo JSON'); }
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
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={handleSecretClick}>
            <div className="w-9 h-9 bg-[#d0d0a0] rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-[#0a0a0a] font-bold text-lg">B</span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight hidden sm:flex items-center gap-1.5">
              Boa Wallet <span className="text-[10px] text-gray-500 py-0.5 px-1.5 bg-gray-800 rounded-md">v1.5.0</span>
            </h1>
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

            {/* Theme */}
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-gray-800 flex items-center justify-center text-gray-400">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* User */}
            {authLoading ? <div className="w-8 h-8 rounded-full border-2 border-[#d0d0a0]/30 border-t-[#d0d0a0] animate-spin" /> : user ? (
              <div className="relative">
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-8 h-8 rounded-full border border-gray-800 cursor-pointer" alt="" />
                ) : (
                  <div onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs cursor-pointer">{(user.email || 'U').charAt(0).toUpperCase()}</div>
                )}
                {showProfileMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[140px]">
                    <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-red-400 text-xs flex items-center gap-2"><LogOut size={14} /> Sair</button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={handleLogin} className="px-3 py-1.5 bg-[#d0d0a0] text-[#0a0a0a] rounded-lg text-xs font-bold transition-transform active:scale-95">Login</button>
            )}

            <button onClick={openNew} className="bg-[#5A5A40] hover:bg-[#6c6c51] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-md">
              <Plus size={16} /> <span className="hidden sm:inline">Novo</span>
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
            <p className="text-gray-400 mb-8 text-sm">Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.</p>
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
              <button onClick={() => confirmDisable('cancelled_temporary')} className="py-4 rounded-xl bg-orange-600 font-bold hover:bg-orange-700 transition-all">Pausa Tempor\u00e1ria</button>
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
             <p className="text-gray-400 mb-6 font-medium">Renovar automaticamente no pr\u00f3ximo m\u00eas?</p>
             <div className="flex flex-col gap-3">
               <button onClick={() => handleRenewalAnswer(true)} className="py-4 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700 transition-all">Sim, renovar</button>
               <button onClick={() => handleRenewalAnswer(false)} className="py-4 rounded-xl bg-gray-800 font-bold hover:bg-gray-700 transition-all">N\u00e3o, me lembre</button>
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
