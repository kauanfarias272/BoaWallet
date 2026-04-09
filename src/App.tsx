import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { SubscriptionList } from './components/SubscriptionList';
import { SubscriptionForm } from './components/SubscriptionForm';
import { GoogleCalendarSync } from './components/GoogleCalendarSync';
import { WelcomeModal } from './components/WelcomeModal';
import { Cashflow } from './components/Cashflow';
import { INITIAL_SUBSCRIPTIONS } from './data';
import { Currency, Subscription, Adjustment, getEffectiveTotalCost } from './types';
import { Plus, AlertTriangle, Globe, DollarSign, ChevronDown, Zap, LogIn, LogOut, Download, Upload, FileText } from 'lucide-react';
import { useAppContext } from './AppContext';
import { useTranslation, Language } from './i18n';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, serverTimestamp } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './lib/utils';

const LANG_OPTIONS = [
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'pt', label: 'PT', flag: '🇧🇷' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'it', label: 'IT', flag: '🇮🇹' },
];

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'TRY', 'ARS', 'INR', 'IDR', 'CAD', 'AUD', 'CHF', 'CNY', 'MXN', 'BTC', 'SATS'];

export default function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(INITIAL_SUBSCRIPTIONS);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<Currency>('USD');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | undefined>(undefined);
  const [subToDelete, setSubToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'cashflow'>('overview');
  const [clickCount, setClickCount] = useState(0);
  const [showSecretMenu, setShowSecretMenu] = useState(false);

  const { language, setLanguage, exchangeRates, userName, setUserName, user, authLoading, gender } = useAppContext();
  const t = useTranslation(language);

  // Secret Menu Logic
  const handleTitleClick = () => {
    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setShowSecretMenu(true);
        return 0;
      }
      return newCount;
    });
  };

  useEffect(() => {
    if (clickCount > 0) {
      const timer = setTimeout(() => setClickCount(0), 2000);
      return () => clearTimeout(timer);
    }
  }, [clickCount]);

  const handleAddAdjustment = async (adjData: Omit<Adjustment, 'id'>) => {
    const newAdj: Adjustment = { ...adjData, id: Date.now().toString() };
    if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/adjustments`, newAdj.id), newAdj);
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
        await deleteDoc(doc(db, `users/${user.uid}/adjustments`, id));
      } catch (error) {
        console.error("Error removing adjustment:", error);
      }
    } else {
      const updated = adjustments.filter(a => a.id !== id);
      setAdjustments(updated);
      localStorage.setItem('boa_adjustments', JSON.stringify(updated));
    }
  };

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(subscriptions));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "boa-wallet-backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setShowSecretMenu(false);
  };

  const importJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedSubs = JSON.parse(e.target?.result as string);
          if (Array.isArray(importedSubs)) {
            setSubscriptions(importedSubs);
            // If logged in, save to Firestore
            if (user) {
              importedSubs.forEach(sub => handleSave(sub));
            }
          }
        } catch (err) {
          console.error("Invalid file");
        }
      };
      reader.readAsText(file);
    }
    setShowSecretMenu(false);
  };

  const exportPDF = () => {
    const docPdf = new jsPDF();
    docPdf.setFontSize(20);
    docPdf.text('Boa Wallet - Relatório de Assinaturas', 14, 22);
    docPdf.setFontSize(10);
    docPdf.text('Gerado automaticamente por Boa Wallet', 14, 30);

    const tableData = subscriptions.map(sub => {
      const effectiveCost = getEffectiveTotalCost(sub);
      return [
        sub.name,
        t(`cat.${sub.category}` as any) === `cat.${sub.category}` ? sub.category : t(`cat.${sub.category}` as any),
        formatCurrency(effectiveCost.amount, effectiveCost.currency),
        t(`form.${sub.billingCycle}` as any) === `form.${sub.billingCycle}` ? sub.billingCycle : t(`form.${sub.billingCycle}` as any)
      ];
    });

    autoTable(docPdf, {
      startY: 40,
      head: [['Nome', 'Categoria', 'Custo', 'Ciclo']],
      body: tableData,
    });

    docPdf.save('boa-wallet-relatorio.pdf');
    setShowSecretMenu(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    let timeGreeting = '';
    if (hour < 12) timeGreeting = t('app.goodMorning');
    else if (hour < 18) timeGreeting = t('app.goodAfternoon');
    else timeGreeting = t('app.goodEvening');
    
    const nameToUse = user?.displayName ? user.displayName.split(' ')[0] : userName;
    return nameToUse ? `${timeGreeting}, ${nameToUse}.` : `${timeGreeting}.`;
  };

  // Sync User Profile
  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        name: user.displayName || userName,
        language,
        baseCurrency,
        createdAt: serverTimestamp()
      }, { merge: true }).catch(console.error);
    }
  }, [user, language, baseCurrency, userName]);

  // Sync with Firestore
  useEffect(() => {
    if (!user) {
      // If not logged in, we could load from local storage or keep initial
      const localSubs = localStorage.getItem('subscriptions');
      if (localSubs) {
        try {
          setSubscriptions(JSON.parse(localSubs));
        } catch (e) {
          console.error("Error parsing local subscriptions", e);
        }
      }
      return;
    }

    // User is logged in, sync from Firestore
    const qSubs = query(collection(db, `users/${user.uid}/subscriptions`));
    const unsubscribeSubs = onSnapshot(qSubs, (snapshot) => {
      const subs: Subscription[] = [];
      snapshot.forEach((doc) => {
        subs.push(doc.data() as Subscription);
      });
      setSubscriptions(subs);
    }, (error) => {
      console.error("Error fetching subscriptions from Firestore:", error);
    });

    const qAdj = query(collection(db, `users/${user.uid}/adjustments`));
    const unsubscribeAdj = onSnapshot(qAdj, (snapshot) => {
      const adjs: Adjustment[] = [];
      snapshot.forEach((doc) => {
        adjs.push(doc.data() as Adjustment);
      });
      setAdjustments(adjs);
    }, (error) => {
      console.error("Error fetching adjustments from Firestore:", error);
    });

    return () => {
      unsubscribeSubs();
      unsubscribeAdj();
    };
  }, [user]);

  // Save to local storage as fallback when not logged in
  useEffect(() => {
    if (!user) {
      localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
      localStorage.setItem('boa_adjustments', JSON.stringify(adjustments));
    }
  }, [subscriptions, adjustments, user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserName('');
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const handleSave = async (sub: Subscription) => {
    if (user) {
      try {
        const subRef = doc(db, `users/${user.uid}/subscriptions`, sub.id);
        const isNew = !sub.createdAt || typeof sub.createdAt === 'string';
        
        await setDoc(subRef, {
          ...sub,
          userId: user.uid,
          createdAt: isNew ? serverTimestamp() : sub.createdAt,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.error("Error saving subscription to Firestore:", error);
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
          await deleteDoc(doc(db, `users/${user.uid}/subscriptions`, subToDelete));
        } catch (error) {
          console.error("Error deleting subscription from Firestore:", error);
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
        if (sub.dueDate === currentDay) {
          showNotification(t('app.reminderTitle'), t('app.reminderBody', { service: sub.name, when: t('app.today') }));
        } else if (sub.dueDate === currentDay + 1 || (currentDay === new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() && sub.dueDate === 1)) {
          showNotification(t('app.reminderTitle'), t('app.reminderBody', { service: sub.name, when: t('app.tomorrow') }));
        }
      });
    };

    const showNotification = (title: string, body: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/logo.png' });
      }
    };

    // Check once on load
    checkReminders();
    
    // Check every hour
    const interval = setInterval(checkReminders, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [subscriptions, t]);

  return (
    <div className="min-h-screen bg-[#121212] text-gray-100 font-sans pb-20 transition-colors duration-200">
      {/* Header */}
      <header className="bg-[#121212]/80 backdrop-blur-md border-b border-gray-800/50 sticky top-0 z-30 transition-colors duration-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="BoaWallet Logo" className="w-10 h-10 rounded-full object-cover shadow-sm" onError={(e) => { e.currentTarget.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=BoaWallet'; }} />
            <h1 
              className="text-2xl font-serif font-medium tracking-tight text-white flex items-center cursor-pointer select-none"
              onClick={handleTitleClick}
            >
              {t('app.title')}
              {(baseCurrency === 'BTC' || baseCurrency === 'SATS') && (
                <Zap className="ml-1.5 text-yellow-400" size={20} fill="currentColor" />
              )}
            </h1>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center bg-[#1a1a1a] border border-gray-800 rounded-full p-1 shadow-inner">
              {/* Language Dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full hover:bg-[#2a2a2a] transition-colors text-sm font-medium text-gray-300">
                  <span>{LANG_OPTIONS.find(l => l.code === language)?.flag}</span>
                  <span className="hidden sm:inline">{LANG_OPTIONS.find(l => l.code === language)?.label}</span>
                  <ChevronDown size={14} className="text-gray-500 hidden sm:block" />
                </button>
                <div className="absolute top-full right-0 mt-2 w-32 bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                  {LANG_OPTIONS.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code as Language)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2a2a] transition-colors text-sm ${language === lang.code ? 'text-white bg-[#2a2a2a]' : 'text-gray-400'}`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-px h-4 bg-gray-800 mx-1"></div>

              {/* Currency Dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full hover:bg-[#2a2a2a] transition-colors text-sm font-medium text-gray-300">
                  <span>{baseCurrency === 'SATS' ? '₿' : baseCurrency === 'BTC' ? '₿' : '$'}</span>
                  <span className="hidden sm:inline">{baseCurrency}</span>
                  <ChevronDown size={14} className="text-gray-500 hidden sm:block" />
                </button>
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 max-h-64 overflow-y-auto">
                  {CURRENCIES.map(curr => (
                    <button
                      key={curr}
                      onClick={() => setBaseCurrency(curr as Currency)}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-[#2a2a2a] transition-colors text-sm ${baseCurrency === curr ? 'text-white bg-[#2a2a2a]' : 'text-gray-400'}`}
                    >
                      <span>{curr}</span>
                      {curr === 'SATS' && <span className="text-xs text-gray-500">Satoshi</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden lg:block">
              <GoogleCalendarSync subscriptions={subscriptions} />
            </div>

            {/* Google Login / User Profile */}
            {!authLoading && (
              <div className="flex items-center">
                {user ? (
                  <div className="relative group">
                    <button className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-gray-800 px-3 py-1.5 rounded-full transition-colors">
                      <img src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`} alt="Profile" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                      <span className="text-sm font-medium text-gray-300 hidden sm:block">{user.displayName?.split(' ')[0]}</span>
                    </button>
                    <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-800">
                        <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2a2a] transition-colors text-sm text-red-400"
                      >
                        <LogOut size={16} />
                        <span>Sair</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-gray-800 px-3 py-1.5 rounded-full transition-colors text-sm font-medium text-gray-300"
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
          <h2 className="text-4xl font-serif font-medium text-white">
            {getGreeting()}
          </h2>
          <p className="text-gray-400 text-lg">
            {t('app.summary')}
          </p>
        </div>

        <div className="flex items-center gap-6 border-b border-gray-800">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'overview' ? 'text-[#d0d0a0]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t('app.overview')}
            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#d0d0a0] rounded-t-full"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('cashflow')}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'cashflow' ? 'text-[#d0d0a0]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t('app.cashflow')}
            {activeTab === 'cashflow' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#d0d0a0] rounded-t-full"></div>}
          </button>
        </div>

        {activeTab === 'overview' ? (
          <>
            <Dashboard 
              subscriptions={subscriptions} 
              baseCurrency={baseCurrency} 
              exchangeRates={exchangeRates} 
              adjustments={adjustments}
              onAddAdjustment={handleAddAdjustment}
              onRemoveAdjustment={handleRemoveAdjustment}
            />
            
            <div className="grid grid-cols-1 gap-8">
              <div className="col-span-1">
                <SubscriptionList 
                  subscriptions={subscriptions} 
                  baseCurrency={baseCurrency} 
                  exchangeRates={exchangeRates}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              </div>
            </div>
          </>
        ) : (
          <Cashflow subscriptions={subscriptions} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />
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
