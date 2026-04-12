import React, { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { SubscriptionList } from './components/SubscriptionList';
import { SubscriptionForm } from './components/SubscriptionForm';
import { GoogleCalendarSync } from './components/GoogleCalendarSync';
import { WelcomeModal } from './components/WelcomeModal';
import { Cashflow } from './components/Cashflow';
import { Currency, Subscription, Adjustment, getEffectiveTotalCost } from './types';
import { Plus, AlertTriangle, Globe, DollarSign, ChevronDown, Zap, LogIn, LogOut, Download, Upload, FileText } from 'lucide-react';
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

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'TRY', 'ARS', 'INR', 'IDR', 'CAD', 'AUD', 'CHF', 'CNY', 'MXN', 'BTC', 'SATS'];

export default function App() {
  const { language, setLanguage, theme, setTheme, exchangeRates, userName, setUserName, user, authLoading, setGoogleAccessToken } = useAppContext();
  const t = useTranslation(language);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'cashflow' | 'calendar'>('overview');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | undefined>();
  const [subToDelete, setSubToDelete] = useState<string | null>(null);
  const [disablePromptSub, setDisablePromptSub] = useState<Subscription | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<Currency>(() => (localStorage.getItem('baseCurrency') as Currency) || 'BRL');
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const secretTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pendingPaymentSub, setPendingPaymentSub] = useState<Subscription | null>(null);
  const [cancelPromptSub, setCancelPromptSub] = useState<Subscription | null>(null);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('baseCurrency', baseCurrency);
  }, [baseCurrency]);

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

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    
    if (currentStatus.startsWith('cancelled')) {
      handleSave({ ...sub, status: 'active' });
    } else {
      setDisablePromptSub(sub);
    }
  };

  const confirmDisable = (type: 'cancelled_temporary' | 'cancelled_permanent') => {
    if (disablePromptSub) {
      handleSave({ ...disablePromptSub, status: type });
      setDisablePromptSub(null);
    }
  };

  const handleCancelAnswer = (sub: Subscription, cancelled: boolean) => {
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
    const history = sub.paymentHistory || {};

    handleSave({
      ...sub,
      status: cancelled ? 'cancelled_permanent' : 'active',
      paymentHistory: { ...history, [currentMonthKey]: 'skipped' }
    });
    setCancelPromptSub(null);
  };

  const handleAddAdjustment = async (adjData: Omit<Adjustment, 'id'>) => {
    const newAdj: Adjustment = { ...adjData, id: Date.now().toString() };
    if (user) {
      try {
        await supabase.from('adjustments').upsert({ ...newAdj, user_id: user.id });
      } catch (error) {
        console.error("Error adding adjustment:", error);
      }
    } else {
      const updated = [...adjustments, newAdj];
      setAdjustments(updated);
      localStorage.setItem('boa_adjustments', JSON.stringify(updated));
    }
  };

  const handleRemoveAdjustment = async (id: string) => {
    if (user) {
      try {
        await supabase.from('adjustments').delete().eq('id', id).eq('user_id', user.id);
      } catch (error) {
        console.error("Error removing adjustment:", error);
      }
    } else {
      const updated = adjustments.filter(a => a.id !== id);
      setAdjustments(updated);
      localStorage.setItem('boa_adjustments', JSON.stringify(updated));
    }
  };

  // Sync User Profile
  useEffect(() => {
    if (user) {
      supabase.from('users').upsert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || userName,
        language,
        base_currency: baseCurrency,
        updated_at: new Date().toISOString()
      }).then(({ error }) => {
        if (error) console.error(error);
      });
    }
  }, [user, language, baseCurrency, userName]);

  // Sync with Supabase
  useEffect(() => {
    if (!user) {
      const localSubs = localStorage.getItem('subscriptions');
      if (localSubs) {
        try { setSubscriptions(JSON.parse(localSubs)); } catch (e) {}
      }
      const localAdj = localStorage.getItem('boa_adjustments');
      if (localAdj) {
        try { setAdjustments(JSON.parse(localAdj)); } catch (e) {}
      }
      return;
    }

    let initialLoad = true;
    const fetchInitialData = async () => {
      const { data: subs } = await supabase.from('subscriptions').select('*').eq('user_id', user.id);
      if (subs) setSubscriptions(subs as any[]);

      const { data: adjs } = await supabase.from('adjustments').select('*').eq('user_id', user.id);
      if (adjs) setAdjustments(adjs as any[]);
    };

    fetchInitialData();

    const subsSubscription = supabase.channel('subs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` }, payload => {
        if (!initialLoad) fetchInitialData();
      }).subscribe();

    const adjsSubscription = supabase.channel('adjs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'adjustments', filter: `user_id=eq.${user.id}` }, payload => {
        if (!initialLoad) fetchInitialData();
      }).subscribe();
    
    initialLoad = false;

    return () => {
      supabase.removeChannel(subsSubscription);
      supabase.removeChannel(adjsSubscription);
    };
  }, [user]);

  // Admin JSON Export (Daily sync)
  useEffect(() => {
    if (user && subscriptions.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const lastSync = localStorage.getItem('last_admin_sync_' + user.id);
      
      if (lastSync !== today) {
        const exportData = {
          userId: user.id,
          userName: userName,
          subscriptions,
          adjustments,
          timestamp: new Date().toISOString()
        };
        
        supabase.from('admin_exports').upsert({
          id: user.id,
          user_id: user.id,
          data: exportData,
          updated_at: new Date().toISOString()
        }).then(({ error }) => {
          if (!error) {
            localStorage.setItem('last_admin_sync_' + user.id, today);
          } else {
            console.error("Failed to export admin data", error);
          }
        });
      }
    }
  }, [user, subscriptions, adjustments, userName]);

  // Save to local storage as fallback when not logged in
  useEffect(() => {
    if (!user) {
      localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
      localStorage.setItem('boa_adjustments', JSON.stringify(adjustments));
    }
  }, [subscriptions, adjustments, user]);

  const handleLogin = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (idToken) {
          const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error("Error signing in", error);
      alert("Sign-in failed: " + (error.message || JSON.stringify(error)));
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUserName('');
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const handleSave = async (sub: Subscription) => {
    if (user) {
      try {
        const isNew = !sub.createdAt || typeof sub.createdAt === 'string';
        await supabase.from('subscriptions').upsert({
          ...sub,
          user_id: user.id,
          createdAt: isNew ? new Date().toISOString() : sub.createdAt,
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error saving subscription:", error);
      }
    } else {
      if (editingSub) {
        setSubscriptions(subs => subs.map(s => s.id === sub.id ? sub : s));
      } else {
        setSubscriptions(subs => [...subs, sub]);
      }
    }
    setIsFormOpen(false);
    setEditingSub(undefined);
  };

  const handleDelete = (id: string) => {
    setSubToDelete(id);
  };

  const confirmDelete = async () => {
    if (subToDelete) {
      if (user) {
        try {
          await supabase.from('subscriptions').delete().eq('id', subToDelete).eq('user_id', user.id);
        } catch (error) {
          console.error("Error deleting subscription:", error);
        }
      } else {
        setSubscriptions(subs => subs.filter(s => s.id !== subToDelete));
      }
      setSubToDelete(null);
    }
  };

  const openEdit = (sub: Subscription) => {
    setEditingSub(sub);
    setIsFormOpen(true);
  };

  const openNew = () => {
    setEditingSub(undefined);
    setIsFormOpen(true);
  };

  // Payment Reminders
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    const checkReminders = () => {
      const today = new Date();
      const currentDay = today.getDate();

      subscriptions.forEach(sub => {
        if (sub.status === 'cancelled_temporary') {
          const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
          if (dayOfYear % 10 === 0) {
            showNotification('Assinatura Pausada', `Você deseja reativar a assinatura ${sub.name}?`);
          }
        } else if (sub.status !== 'cancelled_permanent') {
          if (sub.dueDate === currentDay) {
            showNotification(t('app.reminderTitle'), t('app.reminderBody', { service: sub.name, when: t('app.today') }));
          } else if (sub.hasEarlyPayDiscount && sub.earlyPayDate === currentDay) {
            showNotification(t('app.reminderTitle'), t('app.reminderBody', { service: sub.name, when: t('app.today') }) + ' (Desconto)');
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 12 * 60 * 60 * 1000);
    checkReminders();
    return () => clearInterval(interval);
  }, [subscriptions, t]);

  const showNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/logo_boa.png' });
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(t('app.title'), 20, 20);
    const data = subscriptions.map(sub => [sub.name, sub.category, formatCurrency(getEffectiveTotalCost(sub).amount, getEffectiveTotalCost(sub).currency)]);
    autoTable(doc, {
      head: [[t('app.name'), t('app.category'), t('app.cost')]],
      body: data,
      startY: 30
    });
    doc.save('boa-wallet-report.pdf');
  };

  const exportJSON = async () => {
    const data = JSON.stringify({ subscriptions, adjustments }, null, 2);
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.writeFile({
          path: 'boa-wallet-export.json',
          data,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
        await Share.share({
          title: 'Boa Wallet Export',
          url: result.uri,
          dialogTitle: 'Exportar JSON'
        });
      } catch (e) {
        console.error('Export failed', e);
      }
    } else {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'boa-wallet-export.json';
      a.click();
    }
  };

  const importJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.subscriptions) setSubscriptions(data.subscriptions);
          if (data.adjustments) setAdjustments(data.adjustments);
          alert(t('app.importSuccess'));
        } catch (err) {
          alert('Erro ao importar JSON');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className={`min-h-screen transition-colors ${theme === 'dark' ? 'dark bg-[#0a0a0a]' : 'bg-[#fdfbf7]'}`}>
      <header className="sticky top-0 z-40 w-full bg-[#fdfbf7]/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleSecretClick}>
            <div className="w-10 h-10 bg-[#5A5A40] dark:bg-[#d0d0a0] rounded-xl flex items-center justify-center shadow-lg transform active:scale-95 transition-transform">
              <span className="text-white dark:text-[#0a0a0a] font-serif text-2xl">B</span>
            </div>
            <h1 className="text-2xl font-serif font-medium tracking-tight text-gray-900 dark:text-white hidden sm:block">
              {t('app.title')}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center bg-gray-100 dark:bg-[#1a1a1a] rounded-full p-1 border border-gray-200 dark:border-gray-800">
              {LANG_OPTIONS.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => setLanguage(opt.code as Language)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${language === opt.code ? 'bg-white dark:bg-[#333] text-[#5A5A40] dark:text-[#d0d0a0] shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <span className="mr-1">{opt.flag}</span>
                  {opt.label}
                </button>
              ))}
            </div>

            {authLoading ? (
              <div className="w-8 h-8 rounded-full border-2 border-[#5A5A40] border-t-transparent animate-spin"></div>
            ) : (
              <div className="flex items-center gap-2">
                {user ? (
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end hidden md:flex">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">{user.user_metadata?.full_name || userName}</span>
                      <button onClick={handleLogout} className="text-[10px] text-gray-500 hover:text-red-500 transition-colors">Sair</button>
                    </div>
                    {user.user_metadata?.avatar_url ? (
                      <img src={user.user_metadata.avatar_url} alt="Profile" className="w-9 h-9 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        {userName?.charAt(0) || 'U'}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleLogin}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
                  >
                    <LogIn size={16} />
                    <span className="hidden sm:inline">Entrar</span>
                  </button>
                )}
              </div>
            )}

            <button
              onClick={openNew}
              className="flex items-center gap-2 bg-[#5A5A40] hover:bg-[#4a4a34] text-white px-4 py-2.5 rounded-full text-sm font-medium transition-colors shadow-sm dark:bg-[#7a7a5c] dark:hover:bg-[#8a8a6c]"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">{t('app.newSubscription')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <div className="space-y-2">
          <h2 className="text-4xl font-serif font-medium text-gray-900 dark:text-white">
            {getGreeting()}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            {t('app.summary')}
          </p>
        </div>

        <div className="flex items-center gap-6 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === 'overview'
                ? 'text-[#5A5A40] dark:text-[#d0d0a0]'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            {t('app.overview')}
            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#5A5A40] dark:bg-[#d0d0a0] rounded-t-full"></div>}
          </button>
          <button
            onClick={() => setActiveTab('cashflow')}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === 'cashflow'
                ? 'text-[#5A5A40] dark:text-[#d0d0a0]'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            {t('app.cashflow')}
            {activeTab === 'cashflow' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#5A5A40] dark:bg-[#d0d0a0] rounded-t-full"></div>}
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === 'calendar'
                ? 'text-[#5A5A40] dark:text-[#d0d0a0]'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            Calendário
            {activeTab === 'calendar' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#5A5A40] dark:bg-[#d0d0a0] rounded-t-full"></div>}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === 'history'
                ? 'text-[#5A5A40] dark:text-[#d0d0a0]'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            {t('app.disabledPayments') || 'Desativados'}
            {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#5A5A40] dark:bg-[#d0d0a0] rounded-t-full"></div>}
          </button>
        </div>

        {activeTab === 'overview' && (
          <>
            <Dashboard
              subscriptions={subscriptions.filter(s => !s.status?.startsWith('cancelled'))}
              baseCurrency={baseCurrency}
              exchangeRates={exchangeRates}
              adjustments={adjustments}
              onAddAdjustment={handleAddAdjustment}
              onRemoveAdjustment={handleRemoveAdjustment}
            />

            <div className="grid grid-cols-1 gap-8">
              <div className="col-span-1">
                <SubscriptionList
                  subscriptions={subscriptions.filter(s => !s.status?.startsWith('cancelled'))}
                  baseCurrency={baseCurrency}
                  exchangeRates={exchangeRates}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggleStatus={handleToggleStatus}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'cashflow' && (
          <Cashflow subscriptions={subscriptions.filter(s => !s.status?.startsWith('cancelled'))} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />
        )}

        {activeTab === 'calendar' && (
          <CalendarView 
             subscriptions={subscriptions} 
             baseCurrency={baseCurrency} 
             exchangeRates={exchangeRates} 
             onEdit={openEdit} 
          />
        )}

        {activeTab === 'history' && (
          <div className="grid grid-cols-1 gap-8">
            <div className="col-span-1 opacity-60">
              <h2 className="text-xl font-medium text-gray-900 dark:text-white mb-4">{t('app.disabledPayments') || 'Pagamentos Desativados'}</h2>
              <SubscriptionList
                subscriptions={subscriptions.filter(s => s.status?.startsWith('cancelled'))}
                baseCurrency={baseCurrency}
                exchangeRates={exchangeRates}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggleStatus={handleToggleStatus}
              />
            </div>
          </div>
        )}
      </main>

      {!userName && !user && !authLoading && <WelcomeModal onSave={setUserName} />}

      {isFormOpen && (
        <SubscriptionForm
          subscription={editingSub}
          onSave={handleSave}
          onClose={() => {
            setIsFormOpen(false);
            setEditingSub(undefined);
          }}
        />
      )}

      {/* Secret Menu Modal */}
      {showSecretMenu && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-serif font-medium text-gray-900 dark:text-white">
                {t('app.secretMenu')}
              </h3>
              <button onClick={() => setShowSecretMenu(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <button
                onClick={exportJSON}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#fdfbf7] dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333] rounded-xl transition-colors text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <Download size={18} className="text-[#5A5A40] dark:text-[#d0d0a0]" />
                {t('app.exportJson')}
              </button>

              <label className="w-full flex items-center gap-3 px-4 py-3 bg-[#fdfbf7] dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333] rounded-xl transition-colors text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                <Upload size={18} className="text-[#5A5A40] dark:text-[#d0d0a0]" />
                {t('app.importJson')}
                <input type="file" accept=".json" className="hidden" onChange={importJSON} />
              </label>

              <button
                onClick={exportPDF}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#fdfbf7] dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333] rounded-xl transition-colors text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <FileText size={18} className="text-red-500" />
                {t('app.exportPdf')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable Prompt Modal */}
      {disablePromptSub && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Desabilitar Assinatura
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Esta é uma pausa temporária (onde você pode querer reativar depois e receber lembretes) ou um cancelamento permanente?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => confirmDisable('cancelled_temporary')}
                className="px-6 py-3 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors shadow-sm"
              >
                Pausa Temporária
              </button>
              <button
                onClick={() => confirmDisable('cancelled_permanent')}
                className="px-6 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm"
              >
                Cancelamento Permanente
              </button>
              <button
                onClick={() => setDisablePromptSub(null)}
                className="px-6 py-2.5 mt-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {subToDelete && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {t('app.confirmDelete')}
            </h3>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => setSubToDelete(null)}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-[#fdfbf7] dark:bg-[#121212] hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                {t('app.cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-6 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors shadow-sm dark:shadow-none"
              >
                {t('app.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
