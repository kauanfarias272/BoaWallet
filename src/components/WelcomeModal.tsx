import React, { useState } from 'react';
import { useTranslation } from '../i18n';
import { useAppContext, Gender } from '../AppContext';
import { Wallet } from 'lucide-react';

interface WelcomeModalProps {
  onSave: (name: string) => void;
  onLogin: () => void;
  onWeb3Login?: () => void;
  canUseWeb3Login?: boolean;
  loggingIn?: boolean;
  loginMethod?: 'google' | 'web3' | null;
}

export function WelcomeModal({ onSave, onLogin, onWeb3Login, canUseWeb3Login = false, loggingIn = false, loginMethod = null }: WelcomeModalProps) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('N');
  const { language, setGender: setContextGender } = useAppContext();
  const t = useTranslation(language);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setContextGender(gender);
      onSave(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-md p-8 text-center border border-gray-800">
        {/* Logo */}
        <div className="w-16 h-16 bg-[#d0d0a0] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-[#0a0a0a] font-bold text-2xl">B</span>
        </div>
        
        <h2 className="text-3xl font-medium text-white mb-2">{t('welcome.title')}</h2>
        <p className="text-gray-400 mb-6">{t('welcome.subtitle')}</p>
        
        {/* Google Login Button */}
        <div className="space-y-3 mb-6">
          <button
            type="button"
            onClick={onLogin}
            disabled={loggingIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-100 text-gray-900 rounded-xl transition-colors font-medium shadow-sm disabled:opacity-60"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loggingIn && loginMethod === 'google'
              ? (language === 'pt' ? 'Entrando...' : language === 'es' ? 'Entrando...' : language === 'it' ? 'Accesso...' : 'Signing in...')
              : (language === 'pt' ? 'Entrar com Google' : language === 'es' ? 'Entrar con Google' : language === 'it' ? 'Accedi con Google' : 'Sign in with Google')}
          </button>

          {canUseWeb3Login && onWeb3Login && (
            <button
              type="button"
              onClick={onWeb3Login}
              disabled={loggingIn}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#252525] hover:bg-[#303030] text-white rounded-xl transition-colors font-medium border border-gray-700 disabled:opacity-60"
            >
              <Wallet size={18} />
              {loggingIn && loginMethod === 'web3'
                ? (language === 'pt' ? 'Conectando carteira...' : language === 'es' ? 'Conectando wallet...' : language === 'it' ? 'Connessione wallet...' : 'Connecting wallet...')
                : 'Entrar com Web3'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-700"></div>
          <span className="text-xs text-gray-500 uppercase">{language === 'pt' ? 'ou continue sem conta' : language === 'es' ? 'o continua sin cuenta' : language === 'it' ? 'o continua senza account' : 'or continue without account'}</span>
          <div className="flex-1 h-px bg-gray-700"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('welcome.placeholder')}
              className="w-full px-4 py-3 bg-[#121212] border border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all text-white text-center text-lg"
              autoFocus
            />
          </div>
          
          <div className="space-y-3 text-left">
            <p className="text-sm font-medium text-gray-300">{t('welcome.genderLabel')}</p>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setGender('M')}
                className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${gender === 'M' ? 'bg-[#5A5A40] border-[#5A5A40] text-white' : 'bg-transparent border-gray-700 text-gray-400 hover:border-[#5A5A40]'}`}
              >
                {t('welcome.genderM')}
              </button>
              <button
                type="button"
                onClick={() => setGender('F')}
                className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${gender === 'F' ? 'bg-[#5A5A40] border-[#5A5A40] text-white' : 'bg-transparent border-gray-700 text-gray-400 hover:border-[#5A5A40]'}`}
              >
                {t('welcome.genderF')}
              </button>
              <button
                type="button"
                onClick={() => setGender('N')}
                className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${gender === 'N' ? 'bg-[#5A5A40] border-[#5A5A40] text-white' : 'bg-transparent border-gray-700 text-gray-400 hover:border-[#5A5A40]'}`}
              >
                {t('welcome.genderN')}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full px-6 py-3 text-white bg-[#7a7a5c] hover:bg-[#8a8a6c] disabled:opacity-50 rounded-xl transition-colors font-medium"
          >
            {t('welcome.start')}
          </button>
        </form>
      </div>
    </div>
  );
}
