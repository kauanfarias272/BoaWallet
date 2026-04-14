import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from './i18n';
import { Currency, DEFAULT_EXCHANGE_RATES } from './types';
import { supabase } from './supabase';
import { auth as firebaseAuth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { User } from '@supabase/supabase-js';

export type Gender = 'M' | 'F' | 'N';

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  exchangeRates: Record<Currency, number>;
  userName: string;
  setUserName: (name: string) => void;
  gender: Gender;
  setGender: (gender: Gender) => void;
  user: User | null;
  authLoading: boolean;
  googleAccessToken: string | null;
  setGoogleAccessToken: (token: string | null) => void;
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
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number>>(DEFAULT_EXCHANGE_RATES);
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('userName') || '');
  const [gender, setGender] = useState<Gender>(() => (localStorage.getItem('userGender') as Gender) || 'N');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => localStorage.getItem('googleAccessToken'));

  useEffect(() => {
    let supaUnsub: (() => void) | null = null;

    const tryReauthFromFirebase = async () => {
      const fbUser = firebaseAuth.currentUser;
      if (!fbUser) return false;
      try {
        console.log('[BoaWallet] Firebase active, refreshing Supabase session...');
        const idToken = await fbUser.getIdToken(/* forceRefresh */ true);
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (error) {
          console.warn('[BoaWallet] Supabase re-auth failed:', error.message);
          return false;
        }
        if (data.user) {
          setUser(data.user);
          if (data.user.user_metadata?.full_name) {
            setUserName(data.user.user_metadata.full_name);
          }
          console.log('[BoaWallet] Supabase session restored from Firebase.');
          return true;
        }
      } catch (e) {
        console.warn('[BoaWallet] Firebase token refresh failed:', e);
      }
      return false;
    };

    const init = async () => {
      // 1. Check existing Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user || null;

      if (currentUser) {
        setUser(currentUser);
        if (currentUser.user_metadata?.full_name) {
          setUserName(currentUser.user_metadata.full_name);
        }
        setAuthLoading(false);
      } else {
        // 2. No Supabase session — wait for Firebase to initialize, then re-auth
        const unsubFb = onAuthStateChanged(firebaseAuth, async (fbUser) => {
          if (fbUser) {
            await tryReauthFromFirebase();
          }
          setAuthLoading(false);
          unsubFb(); // only need this once on startup
        });
      }

      // 3. Listen to Supabase auth state for ongoing changes (login/logout)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const currentUser = session?.user || null;
        setUser(currentUser);
        if (currentUser?.user_metadata?.full_name) {
          setUserName(currentUser.user_metadata.full_name);
        } else if (!currentUser) {
          setUserName('');
        }
      });
      supaUnsub = () => subscription.unsubscribe();
    };

    init();

    return () => { supaUnsub?.(); };
  }, []);

  useEffect(() => { localStorage.setItem('userName', userName); }, [userName]);
  useEffect(() => { localStorage.setItem('userGender', gender); }, [gender]);

  // Force dark mode always
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Fetch real-time exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const fiatRes = await fetch('https://open.er-api.com/v6/latest/USD');
        const fiatData = await fiatRes.json();
        const btcRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const btcData = await btcRes.json();

        if (fiatData?.rates && btcData?.bitcoin) {
          const newRates: Record<Currency, number> = { ...DEFAULT_EXCHANGE_RATES };
          (Object.keys(newRates) as Currency[]).forEach(currency => {
            if (currency !== 'BTC' && fiatData.rates[currency]) {
              newRates[currency] = fiatData.rates[currency];
            }
          });
          const btcPriceInUsd = btcData.bitcoin.usd;
          newRates['BTC'] = 1 / btcPriceInUsd;
          newRates['SATS'] = (1 / btcPriceInUsd) * 100000000;
          setExchangeRates(newRates);
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
      }
    };

    fetchRates();
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppContext.Provider value={{ language, setLanguage, theme, setTheme, exchangeRates, userName, setUserName, gender, setGender, user, authLoading, googleAccessToken, setGoogleAccessToken }}>
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
