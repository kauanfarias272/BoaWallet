import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { onAuthStateChanged } from 'firebase/auth';
import { Language } from './i18n';
import { auth as firebaseAuth } from './firebase';
import { supabase } from './supabase';
import { Currency, DEFAULT_EXCHANGE_RATES } from './types';
import { persistSessionTokens, loadPersistedTokens, clearPersistedTokens } from './lib/durableSession';

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
  userHandle: string;
  setUserHandle: (handle: string) => void;
  saveUserHandle: (handle: string) => Promise<{ ok: boolean; error?: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const getBrowserLanguage = (): Language => {
  const lang = navigator.language.split('-')[0];
  if (['pt', 'en', 'es', 'it'].includes(lang)) return lang as Language;
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
  const [userHandle, setUserHandle] = useState<string>(() => localStorage.getItem('userHandle') || '');

  useEffect(() => {
    let supaUnsub: (() => void) | null = null;

    const loadHandle = async (uid: string) => {
      try {
        const { data } = await supabase.from('users').select('username').eq('id', uid).single();
        if (data?.username) {
          setUserHandle(data.username);
          localStorage.setItem('userHandle', data.username);
        } else {
          setUserHandle('');
          localStorage.removeItem('userHandle');
        }
      } catch {
        setUserHandle('');
        localStorage.removeItem('userHandle');
      }
    };

    const tryReauthFromFirebase = async () => {
      try {
        const isNativePlatform = Capacitor.getPlatform() !== 'web';
        let idToken: string | null = null;

        if (isNativePlatform) {
          // Native login now uses browser OAuth (PKCE) — Firebase native is bypassed.
          // Skip Firebase reauth entirely on native; Supabase session is self-sufficient.
          return false;
        } else {
          const fbUser = firebaseAuth.currentUser;
          if (fbUser) {
            console.log('[BoaWallet] Firebase web active, refreshing Supabase session...');
            idToken = await fbUser.getIdToken(true);
          }
        }

        if (!idToken) return false;

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
          await loadHandle(data.user.id);
          console.log('[BoaWallet] Supabase session restored from Firebase.');
          return true;
        }
      } catch (error) {
        console.warn('[BoaWallet] Firebase token refresh failed:', error);
      }

      return false;
    };

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUser = session?.user || null;

      if (currentUser) {
        setUser(currentUser);
        if (currentUser.user_metadata?.full_name) {
          setUserName(currentUser.user_metadata.full_name);
        }
        await loadHandle(currentUser.id);
        if (session?.refresh_token) {
          persistSessionTokens(session.refresh_token, session.access_token).catch(() => {});
        }
        setAuthLoading(false);
      } else {
        // Native: try recovering session from durable store (SharedPreferences)
        if (Capacitor.getPlatform() !== 'web') {
          try {
            const { refreshToken } = await loadPersistedTokens();
            if (refreshToken) {
              console.log('[BoaWallet] Attempting session recovery from durable store...');
              const { data, error } = await supabase.auth.setSession({
                refresh_token: refreshToken,
                access_token: '',
              });
              if (!error && data?.session?.user) {
                setUser(data.session.user);
                if (data.session.user.user_metadata?.full_name) {
                  setUserName(data.session.user.user_metadata.full_name);
                }
                await loadHandle(data.session.user.id);
                await persistSessionTokens(data.session.refresh_token, data.session.access_token);
                console.log('[BoaWallet] Session recovered from durable store.');
                setAuthLoading(false);
                // skip Firebase reauth — session is restored
                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
                  const currentSessionUser = session?.user || null;
                  setUser(currentSessionUser);
                  if (currentSessionUser?.user_metadata?.full_name) {
                    setUserName(currentSessionUser.user_metadata.full_name);
                    await loadHandle(currentSessionUser.id);
                  } else {
                    setUserName('');
                    setUserHandle('');
                    setGoogleAccessToken(null);
                    localStorage.removeItem('userHandle');
                  }
                  if (session?.refresh_token) {
                    persistSessionTokens(session.refresh_token, session.access_token).catch(() => {});
                  } else {
                    clearPersistedTokens().catch(() => {});
                  }
                });
                supaUnsub = () => subscription.unsubscribe();
                return; // early return — init complete
              } else {
                console.warn('[BoaWallet] Durable session recovery failed:', error?.message);
                await clearPersistedTokens();
              }
            }
          } catch (e) {
            console.warn('[BoaWallet] Durable store read failed:', e);
            await clearPersistedTokens().catch(() => {});
          }
        }

        const restored = await tryReauthFromFirebase();
        if (restored) {
          setAuthLoading(false);
        } else {
          const unsubFb = onAuthStateChanged(firebaseAuth, async (fbUser) => {
            if (fbUser) {
              await tryReauthFromFirebase();
            }
            setAuthLoading(false);
            unsubFb();
          });
        }
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, session) => {
        const currentSessionUser = session?.user || null;
        setUser(currentSessionUser);

        if (currentSessionUser?.user_metadata?.full_name) {
          setUserName(currentSessionUser.user_metadata.full_name);
          await loadHandle(currentSessionUser.id);
        } else {
          setUserName('');
          setUserHandle('');
          setGoogleAccessToken(null);
          localStorage.removeItem('userHandle');
        }

        // Persist tokens to durable store (native only)
        if (session?.refresh_token) {
          persistSessionTokens(session.refresh_token, session.access_token).catch(() => {});
        } else {
          clearPersistedTokens().catch(() => {});
        }
      });

      supaUnsub = () => subscription.unsubscribe();
    };

    init();
    return () => {
      supaUnsub?.();
    };
  }, []);

  // Native: refresh session proactively on app resume
  useEffect(() => {
    if (Capacitor.getPlatform() === 'web') return;

    const listener = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      console.log('[BoaWallet] App resumed, refreshing session...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const expiresAt = session.expires_at ?? 0;
          const now = Math.floor(Date.now() / 1000);
          if (expiresAt - now < 300) {
            const { data } = await supabase.auth.refreshSession();
            if (data.session) {
              await persistSessionTokens(data.session.refresh_token, data.session.access_token);
            }
          }
        } else {
          // Session lost while backgrounded — try durable recovery
          const { refreshToken } = await loadPersistedTokens();
          if (refreshToken) {
            const { data } = await supabase.auth.setSession({
              refresh_token: refreshToken,
              access_token: '',
            });
            if (data?.session) {
              await persistSessionTokens(data.session.refresh_token, data.session.access_token);
              console.log('[BoaWallet] Session recovered on resume from durable store.');
            }
          }
        }
      } catch (e) {
        console.warn('[BoaWallet] Resume session refresh failed:', e);
      }
    });

    return () => { listener.then(l => l.remove()); };
  }, []);

  useEffect(() => {
    localStorage.setItem('userName', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('userGender', gender);
  }, [gender]);

  useEffect(() => {
    localStorage.setItem('userHandle', userHandle);
  }, [userHandle]);

  useEffect(() => {
    if (googleAccessToken) {
      localStorage.setItem('googleAccessToken', googleAccessToken);
    } else {
      localStorage.removeItem('googleAccessToken');
    }
  }, [googleAccessToken]);

  const saveUserHandle = async (handle: string): Promise<{ ok: boolean; error?: string }> => {
    const clean = handle.replace('@', '').toLowerCase().trim();
    if (!clean) return { ok: false, error: 'Username vazio' };
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      return { ok: false, error: 'Use 3-20 caracteres: letras, numeros e _' };
    }
    if (!user) return { ok: false, error: 'Faca login primeiro' };

    try {
      const { data: existingProfile, error: existingError } = await supabase
        .from('users')
        .select('id, username')
        .eq('id', user.id)
        .maybeSingle();

      if (existingError) return { ok: false, error: existingError.message };

      if (existingProfile?.username) {
        if (existingProfile.username === clean) {
          setUserHandle(clean);
          return { ok: true };
        }
        return { ok: false, error: 'Seu @username e permanente e nao pode ser alterado' };
      }

      const { error } = await supabase.from('users').upsert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || userName || '',
        username: clean,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        if (error.code === '23505') return { ok: false, error: '@' + clean + ' ja esta em uso' };
        return { ok: false, error: error.message };
      }

      setUserHandle(clean);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  };

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const fiatRes = await fetch('https://open.er-api.com/v6/latest/USD');
        const fiatData = await fiatRes.json();
        const btcRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const btcData = await btcRes.json();

        if (fiatData?.rates && btcData?.bitcoin) {
          const newRates: Record<Currency, number> = { ...DEFAULT_EXCHANGE_RATES };
          (Object.keys(newRates) as Currency[]).forEach((currency) => {
            if (currency !== 'BTC' && fiatData.rates[currency]) {
              newRates[currency] = fiatData.rates[currency];
            }
          });
          const btcPriceInUsd = btcData.bitcoin.usd;
          newRates.BTC = 1 / btcPriceInUsd;
          newRates.SATS = (1 / btcPriceInUsd) * 100000000;
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
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        theme,
        setTheme,
        exchangeRates,
        userName,
        setUserName,
        gender,
        setGender,
        user,
        authLoading,
        googleAccessToken,
        setGoogleAccessToken,
        userHandle,
        setUserHandle,
        saveUserHandle,
      }}
    >
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
