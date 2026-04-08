import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from './i18n';
import { Currency, DEFAULT_EXCHANGE_RATES } from './types';

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  exchangeRates: Record<Currency, number>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const getBrowserLanguage = (): Language => {
  const lang = navigator.language.split('-')[0];
  if (['pt', 'en', 'es', 'it'].includes(lang)) {
    return lang as Language;
  }
  return 'en';
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(getBrowserLanguage());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number>>(DEFAULT_EXCHANGE_RATES);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Fetch real-time exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        // Fetch fiat rates relative to USD
        const fiatRes = await fetch('https://open.er-api.com/v6/latest/USD');
        const fiatData = await fiatRes.json();
        
        // Fetch BTC rate relative to USD
        const btcRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const btcData = await btcRes.json();
        
        if (fiatData && fiatData.rates && btcData && btcData.bitcoin) {
          const newRates: Record<Currency, number> = { ...DEFAULT_EXCHANGE_RATES };
          
          // Update fiat rates
          (Object.keys(newRates) as Currency[]).forEach(currency => {
            if (currency !== 'BTC' && fiatData.rates[currency]) {
              newRates[currency] = fiatData.rates[currency];
            }
          });
          
          // Update BTC rate (1 USD = X BTC)
          const btcPriceInUsd = btcData.bitcoin.usd;
          newRates['BTC'] = 1 / btcPriceInUsd;
          
          setExchangeRates(newRates);
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
      }
    };

    fetchRates();
    // Refresh every 5 minutes
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppContext.Provider value={{ language, setLanguage, theme, setTheme, exchangeRates }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
