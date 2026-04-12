import React, { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { SubscriptionList } from './components/SubscriptionList';
import { SubscriptionForm } from './components/SubscriptionForm';
import { WelcomeModal } from './components/WelcomeModal';
import { Cashflow } from './components/Cashflow';
import { ClientsTab } from './components/ClientsTab';
import { Currency, Subscription, Adjustment, getEffectiveTotalCost } from './types';
import { Plus, AlertTriangle, LogIn, Download, Upload, FileText, Moon, Sun, ChevronDown } from 'lucide-react';
import { useAppContext } from './AppContext';
import { useTranslation, Language } from './i18n';
import { supabase } from './supabase';
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
  const { language, setLanguage, theme, setTheme, exchangeRates, userName, setUserName, user, authLoading } = useAppContext();
  const t = useTranslation(language);

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'cashflow' | 'calendar' | 'clients'>('overview');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | undefined>();
  const [subToDelete, setSubToDelete] = useState<string | null>(null);
  const [disablePromptSub, setDisablePromptSub] = useState<Subscription | null>(null);
  const [disableType, setDisableType] = useState<'permanent' | 'temporary' | null>(null);
  const [renewPromptSub, setRenewPromptSub] = useState<Subscription | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<Currency>(() => (localStorage.getItem('baseCurrency') as Currency) || 'BRL');
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const secretTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currencyRef = useRef<HTMLDivElement>(null);

  // Close currency dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setShowCurrencyMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('app.morning');
    if (hour < 18) return t('app.afternoon');
    return t('app.evening');
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

  const confirmDisablePermanent = () => {
    if (disablePromptSub) {
      handleSave({ ...disablePromptSub, status: 'cancelled_permanent' });
      setDisablePromptSub(null);
      setDisableType(null);
    }
  };

  const confirmDisableTemporary = () => {
    // Ask if they want auto-renew next month
    setDisableType('temporary');
  };

  const confirmTemporaryWithRenew = (autoRenew: boolean) => {
    if (disablePromptSub) {
      handleSave({
        ...disablePromptSub,
        status: 'cancelled_temporary',
        temporaryAutoRenew: autoRenew,
      } as any);
      setDisablePromptSub(null);
      setDisableType(null);
    }
  };

  // --- Adjustments ---
  const handleAddAdjustment = async (adjData: Omit<Adjustment, 'id'>) => {
    const newAdj: Adjustment = { ...adjData, id: Date.now().toString() };
    if (user) {
      await supabase.from('adjustments').upsert({ ...newAdj, user_id: user.id });
    } else {
      const updated = [...adjustments, newAdj];
      setAdjustments(updated);
      localStorage.setItem('boa_adjustments', JSON.stringify(updated));
    }
  };

  const handleRemoveAdjustment = async (id: string) => {
    if (user) {
      await supabase.from('adjustments').delete().eq('id', id).eq('user_id', user.id);
    } else {
      const updated = adjustments.filter(a => a.id !== id);
      setAdjustments(updated);
      localStorage.setItem('boa_adjustments', JSON.stringify(updated));
    }
  };

  // --- Supabase sync ---
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
      try { const s = localStorage.getItem('subscriptions'); if (s) setSubscriptions(JSON.parse(s)); } catch {}
      try { const a = localStorage.getItem('boa_adjustments'); if (a) setAdjustments(JSON.parse(a)); } catch {}
      return;
    }
    const fetchAll = async () => {
      const { data: subs } = await supabase.from('subscriptions').select('*').eq('user_id', user.id);
      if (subs) setSubscriptions(subs as any[]);
      const { data: adjs } = await supabase.from('adjustments').select('*').eq('user_id', user.id);
      if (adjs) setAdjustments(adjs as any[]);
    };
    fetchAll();
    const ch1 = supabase.channel('subs').on('postgres_changes',{event:'*',schema:'public',table:'subscriptions',filter:`user_id=eq.${user.id}`}, fetchAll).subscribe();
    const ch2 = supabase.channel('adjs').on('postgres_changes',{event:'*',schema:'public',table:'adjustments',filter:`user_id=eq.${user.id}`}, fetchAll).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [user]);

  // Daily admin export
  useEffect(() => {
    if (!user || subscriptions.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem('last_admin_sync_' + user.id) === today) return;
    supabase.from('admin_exports').upsert({
      id: user.id, user_id: user.id,
      data: { userId: user.id, userName, subscriptions, adjustments, timestamp: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }).then(({ error }) => {
      if (!error) localStorage.setItem('last_admin_sync_' + user.id, today);
    });
  }, [user, subscriptions, adjustments, userName]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
      localStorage.setItem('boa_adjustments', JSON.stringify(adjustments));
    }
  }, [subscriptions, adjustments, user]);

  // Auto-renew check for temporary cancelled subs
  useEffect(() => {
    const today = new Date();
    subscriptions.forEach(sub => {
      if ((sub as any).status === 'cancelled_temporary' && (sub as any).temporaryAutoRenew === true) {
        const month = today.getMonth();
        const year = today.getFullYear();
        const key = `auto_renew_${sub.id}_${year}_${month}`;
        if (!localStorage.getItem(key)) {
          handleSave({ ...sub, status: 'active' } as any);
          localStorage.setItem(key, '1');
        }
      }
    });
  }, [subscriptions]);

  // 10-day reminder for temporary cancelled (no auto-renew)
  useEffect(() => {
    const check = () => {
      subscriptions.forEach(sub => {
        if ((sub as any).status === 'cancelled_temporary' && !(sub as any).temporaryAutoRenew) {
          const lastKey = `reminder_${sub.id}`;
          const last = parseInt(localStorage.getItem(lastKey) || '0');
          const now = Date.now();
          if (now - last > 10 * 24 * 60 * 60 * 1000) {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Boa Wallet', { body: `Você voltou a assinar ${sub.name}? Verifique no app.` });
            }
            localStorage.setItem(lastKey, now.toString());
          }
        }
      });
    };
    const interval = setInterval(check, 60 * 60 * 1000);
    check();
    return () => clearInterval(interval);
  }, [subscriptions]);

  // --- Login ---
  const handleLogin = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error('No credential available — verifique o SHA-1 no Firebase Console e o google-services.json');
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
        if (error) throw error;
      }
    } catch (error: any) {
      alert('Login falhou: ' + (error.message || JSON.stringify(error)));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserName('');
  };

  const handleSave = async (sub: Subscription) => {
    if (user) {
      await supabase.from('subscriptions').upsert({
        ...sub, user_id: user.id,
        createdAt: sub.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else {
      setSubscriptions(subs =>
        subs.find(s => s.id === sub.id) ? subs.map(s => s.id === sub.id ? sub : s) : [...subs, sub]
      );
    }
    setIsFormOpen(false);
    setEditingSub(undefined);
  };

  const handleDelete = (id: string) => setSubToDelete(id);
  const confirmDelete = async () => {
    if (!subToDelete) return;
    if (user) await supabase.from('subscriptions').delete().eq('id', subToDelete).eq('user_id', user.id);
    else setSubscriptions(subs => subs.filter(s => s.id !== subToDelete));
    setSubToDelete(null);
  };

  const openEdit = (sub: Subscription) => { setEditingSub(sub); setIsFormOpen(true); };
  const openNew  = () => { setEditingSub(undefined); setIsFormOpen(true); };

  // Notifications
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'denied') Notification.requestPermission();
    const check = () => {
      const day = new Date().getDate();
      subscriptions.forEach(sub => {
        if (sub.status && sub.status !== 'active') return;
        if (sub.dueDate === day) new Notification?.('Boa Wallet', { body: `Pagamento hoje: ${sub.name}` });
      });
    };
    const iv = setInterval(check, 12 * 3600 * 1000);
    return () => clearInterval(iv);
  }, [subscriptions]);

  // Export
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('Boa Wallet', 20, 20);
    const data = subscriptions.map(sub => [sub.name, sub.category, formatCurrency(getEffectiveTotalCost(sub).amount, getEffectiveTotalCost(sub).currency)]);
    autoTable(doc, { head: [['Nome','Categoria','Custo']], body: data, startY: 30 });
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

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target?.result as string);
        if (d.subscriptions) setSubscriptions(d.subscriptions);
        if (d.adjustments) setAdjustments(d.adjustments);
        alert('Importado com sucesso!');
      } catch { alert('Erro ao importar JSON'); }
    };
    reader.readAsText(file);
  };

  const activeSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));
  const disabledSubs = subscriptions.filter(s => s.status?.startsWith('cancelled'));

  const TABS = [
    { id: 'overview', label: t('app.overview') },
    { id: 'cashflow', label: t('app.cashflow') },
    { id: 'calendar', label: 'Calendário' },
    { id: 'clients',  label: 'Clientes' },
    { id: 'history',  label: 'Desativados' },
  ] as const;

  return (
    <div className={`min-h-screen transition-colors font-sans ${
      theme === 'dark' ? 'dark bg-[#0f0f0f] text-gray-100' : 'bg-[#f8f8f6] text-gray-900'
    }`}>
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-40 w-full border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-[#0f0f0f]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={handleSecretClick}>
            <div className="w-8 h-8 rounded-lg bg-[#5A5A40] dark:bg-[#c8c89a] flex items-center justify-center shadow">
              <span className="text-white dark:text-[#0f0f0f] font-bold text-base leading-none">B</span>
            </div>
            <span className="font-semibold text-base text-gray-900 dark:text-white tracking-tight hidden sm:block">Boa Wallet</span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5">

            {/* Language selector — compact */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-0.5 gap-0.5">
              {LANG_OPTIONS.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => setLanguage(opt.code as Language)}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-all ${
                    language === opt.code
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {opt.flag}
                </button>
              ))}
            </div>

            {/* Currency selector */}
            <div className="relative" ref={currencyRef}>
              <button
                onClick={() => setShowCurrencyMenu(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {baseCurrency}
                <ChevronDown size={12} />
              </button>
              {showCurrencyMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#1c1c1c] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-1 grid grid-cols-4 gap-0.5 w-44">
                  {CURRENCIES.map(c => (
                    <button
                      key={c}
                      onClick={() => { setBaseCurrency(c); setShowCurrencyMenu(false); }}
                      className={`px-1.5 py-1 text-xs rounded-lg transition-colors font-medium ${
                        baseCurrency === c
                          ? 'bg-[#5A5A40] dark:bg-[#c8c89a] text-white dark:text-[#0f0f0f]'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Auth */}
            {authLoading ? (
              <div className="w-7 h-7 rounded-full border-2 border-[#5A5A40] border-t-transparent animate-spin" />
            ) : user ? (
              <div className="flex items-center gap-1.5">
                {user.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="Profile" className="w-7 h-7 rounded-full border border-gray-200 dark:border-gray-700" />
                  : <div className="w-7 h-7 rounded-full bg-[#5A5A40] dark:bg-[#c8c89a] text-white dark:text-[#0f0f0f] text-xs font-bold flex items-center justify-center">{(user.user_metadata?.full_name || userName || 'U').charAt(0).toUpperCase()}</div>
                }
                <button onClick={handleLogout} className="hidden sm:block text-xs text-gray-400 hover:text-red-500 transition-colors">Sair</button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#5A5A40] dark:bg-[#c8c89a] text-white dark:text-[#0f0f0f] hover:opacity-90 transition-opacity"
              >
                <LogIn size={13} />
                <span>Entrar</span>
              </button>
            )}

            {/* New subscription */}
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 bg-[#5A5A40] dark:bg-[#c8c89a] hover:opacity-90 text-white dark:text-[#0f0f0f] px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity shadow-sm"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">{t('app.newSubscription')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── MAIN ─── */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Greeting */}
        <div>
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">{getGreeting()}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('app.summary')}</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-5 border-b border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-[#5A5A40] dark:text-[#c8c89a]'
                  : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40] dark:bg-[#c8c89a] rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <>
            <Dashboard
              subscriptions={activeSubs}
              baseCurrency={baseCurrency}
              exchangeRates={exchangeRates}
              adjustments={adjustments}
              onAddAdjustment={handleAddAdjustment}
              onRemoveAdjustment={handleRemoveAdjustment}
            />
            <SubscriptionList
              subscriptions={activeSubs}
              baseCurrency={baseCurrency}
              exchangeRates={exchangeRates}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggleStatus={handleToggleStatus}
            />
          </>
        )}

        {activeTab === 'cashflow' && (
          <Cashflow subscriptions={activeSubs} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />
        )}

        {activeTab === 'calendar' && (
          <CalendarView subscriptions={subscriptions} baseCurrency={baseCurrency} exchangeRates={exchangeRates} onEdit={openEdit} />
        )}

        {activeTab === 'clients' && (
          <ClientsTab subscriptions={subscriptions} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />
        )}

        {activeTab === 'history' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Assinaturas Desativadas</h2>
            {disabledSubs.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-sm">Nenhuma assinatura desativada.</p>
              </div>
            ) : (
              <div className="opacity-70">
                <SubscriptionList
                  subscriptions={disabledSubs}
                  baseCurrency={baseCurrency}
                  exchangeRates={exchangeRates}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggleStatus={handleToggleStatus}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {!userName && !user && !authLoading && <WelcomeModal onSave={setUserName} />}

      {isFormOpen && (
        <SubscriptionForm
          subscription={editingSub}
          onSave={handleSave}
          onClose={() => { setIsFormOpen(false); setEditingSub(undefined); }}
        />
      )}

      {/* Disable prompt - step 1: permanent or temporary? */}
      {disablePromptSub && disableType === null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Desabilitar Assinatura</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <strong>{disablePromptSub.name}</strong> — é uma pausa temporária ou cancelamento permanente?
            </p>
            <div className="space-y-2">
              <button onClick={confirmDisableTemporary} className="w-full py-3 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-colors">⏸ Pausa Temporária</button>
              <button onClick={confirmDisablePermanent} className="w-full py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">❌ Cancelamento Permanente</button>
              <button onClick={() => setDisablePromptSub(null)} className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Voltar</button>
            </div>
          </div>
        </div>
      )}

      {/* Disable prompt - step 2 (temporary): auto-renew? */}
      {disablePromptSub && disableType === 'temporary' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Pausa Temporária</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pretende renovar <strong>{disablePromptSub.name}</strong> no mesmo dia do próximo mês?
            </p>
            <div className="space-y-2">
              <button onClick={() => confirmTemporaryWithRenew(true)} className="w-full py-3 text-sm font-medium text-white bg-[#5A5A40] dark:bg-[#c8c89a] dark:text-[#0f0f0f] rounded-xl transition-colors hover:opacity-90">✅ Sim, renovar automaticamente</button>
              <button onClick={() => confirmTemporaryWithRenew(false)} className="w-full py-3 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">🔔 Não, me lembrar a cada 10 dias</button>
              <button onClick={() => setDisableType(null)} className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Voltar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {subToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={28} />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{t('app.confirmDelete')}</h3>
            <div className="flex justify-center gap-3 mt-5">
              <button onClick={() => setSubToDelete(null)} className="px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full">{t('app.cancel')}</button>
              <button onClick={confirmDelete} className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-full">{t('app.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Secret menu */}
      {showSecretMenu && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">⚙️ Menu Secreto</h3>
              <button onClick={() => setShowSecretMenu(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-2">
              <button onClick={exportJSON} className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">
                <Download size={16} className="text-[#5A5A40] dark:text-[#c8c89a]" /> Exportar JSON
              </button>
              <label className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                <Upload size={16} className="text-[#5A5A40] dark:text-[#c8c89a]" /> Importar JSON
                <input type="file" accept=".json" className="hidden" onChange={importJSON} />
              </label>
              <button onClick={exportPDF} className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">
                <FileText size={16} className="text-red-500" /> Exportar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
