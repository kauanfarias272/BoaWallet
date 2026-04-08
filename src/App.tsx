import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { SubscriptionList } from './components/SubscriptionList';
import { SavingsCalculator } from './components/SavingsCalculator';
import { SubscriptionForm } from './components/SubscriptionForm';
import { GoogleCalendarSync } from './components/GoogleCalendarSync';
import { INITIAL_SUBSCRIPTIONS } from './data';
import { Currency, Subscription } from './types';
import { Plus, Moon, Sun, AlertTriangle } from 'lucide-react';
import { useAppContext } from './AppContext';
import { useTranslation, Language } from './i18n';

export default function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(INITIAL_SUBSCRIPTIONS);
  const [baseCurrency, setBaseCurrency] = useState<Currency>('USD');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | undefined>(undefined);
  const [subToDelete, setSubToDelete] = useState<string | null>(null);

  const { language, setLanguage, theme, setTheme, exchangeRates } = useAppContext();
  const t = useTranslation(language);

  const handleSave = (sub: Subscription) => {
    if (editingSub) {
      setSubscriptions(subs => subs.map(s => s.id === sub.id ? sub : s));
    } else {
      setSubscriptions(subs => [...subs, sub]);
    }
    setIsFormOpen(false);
    setEditingSub(undefined);
  };

  const handleDelete = (id: string) => {
    setSubToDelete(id);
  };

  const confirmDelete = () => {
    if (subToDelete) {
      setSubscriptions(subs => subs.filter(s => s.id !== subToDelete));
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
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans pb-20 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="BoaWallet Logo" className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 p-1 object-cover" onError={(e) => { e.currentTarget.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=BoaWallet'; }} />
            <h1 className="text-xl font-semibold tracking-tight">{t('app.title')}</h1>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">{t('app.language')}:</span>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
              >
                <option value="pt">PT</option>
                <option value="en">EN</option>
                <option value="es">ES</option>
                <option value="it">IT</option>
              </select>
            </div>

            <div className="hidden lg:block">
              <GoogleCalendarSync subscriptions={subscriptions} />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="hidden sm:inline text-gray-500 dark:text-gray-400">{t('app.baseCurrency')}:</span>
              <select 
                value={baseCurrency} 
                onChange={(e) => setBaseCurrency(e.target.value as Currency)}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
              >
                <option value="USD">USD ($)</option>
                <option value="BRL">BRL (R$)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
                <option value="TRY">TRY (₺)</option>
                <option value="ARS">ARS ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="IDR">IDR (Rp)</option>
                <option value="CAD">CAD (C$)</option>
                <option value="AUD">AUD (A$)</option>
                <option value="CHF">CHF</option>
                <option value="CNY">CNY (¥)</option>
                <option value="MXN">MXN ($)</option>
                <option value="BTC">BTC (₿)</option>
              </select>
            </div>
            <button 
              onClick={openNew}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">{t('app.newSubscription')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <Dashboard subscriptions={subscriptions} baseCurrency={baseCurrency} exchangeRates={exchangeRates} />
        
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2">
            <SubscriptionList 
              subscriptions={subscriptions} 
              baseCurrency={baseCurrency} 
              exchangeRates={exchangeRates}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          </div>
          <div className="xl:col-span-1">
            <SavingsCalculator 
              subscriptions={subscriptions} 
              baseCurrency={baseCurrency} 
              exchangeRates={exchangeRates}
            />
          </div>
        </div>
      </main>

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

      {/* Delete Confirmation Modal */}
      {subToDelete && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {t('app.confirmDelete')}
            </h3>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => setSubToDelete(null)}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                {t('app.cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-6 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200 dark:shadow-none"
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
