import React, { useState } from 'react';
import { useTranslation } from '../i18n';
import { useAppContext, Gender } from '../AppContext';

export function WelcomeModal({ onSave }: { onSave: (name: string, gender: Gender) => void }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('N');
  const { language } = useAppContext();
  const t = useTranslation(language);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSave(name.trim(), gender);
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <h2 className="text-3xl font-serif font-medium text-gray-900 dark:text-white mb-2">{t('welcome.title')}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">{t('welcome.subtitle')}</p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('welcome.placeholder')}
              className="w-full px-4 py-3 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all dark:text-white text-center text-lg"
              autoFocus
            />
          </div>
          
          <div className="space-y-3 text-left">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('welcome.genderLabel')}</p>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setGender('M')}
                className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${gender === 'M' ? 'bg-[#5A5A40] border-[#5A5A40] text-white' : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#5A5A40]'}`}
              >
                {t('welcome.genderM')}
              </button>
              <button
                type="button"
                onClick={() => setGender('F')}
                className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${gender === 'F' ? 'bg-[#5A5A40] border-[#5A5A40] text-white' : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#5A5A40]'}`}
              >
                {t('welcome.genderF')}
              </button>
              <button
                type="button"
                onClick={() => setGender('N')}
                className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${gender === 'N' ? 'bg-[#5A5A40] border-[#5A5A40] text-white' : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#5A5A40]'}`}
              >
                {t('welcome.genderN')}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full px-6 py-3 text-white bg-[#5A5A40] hover:bg-[#4a4a34] disabled:opacity-50 rounded-xl transition-colors font-medium"
          >
            {t('welcome.start')}
          </button>
        </form>
      </div>
    </div>
  );
}
