import React, { useState } from 'react';
import { Adjustment, Currency, convertCurrency } from '../types';
import { X, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';
import { formatCurrency } from '../lib/utils';

interface AdjustmentsModalProps {
  subscriptions: import('../types').Subscription[];
  adjustments: Adjustment[];
  onAdd: (adj: Omit<Adjustment, 'id'>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
}

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'TRY', 'ARS', 'INR', 'IDR', 'CAD', 'AUD', 'CHF', 'CNY', 'MXN', 'BTC', 'SATS'];

export function AdjustmentsModal({ subscriptions, adjustments, onAdd, onRemove, onClose, baseCurrency, exchangeRates }: AdjustmentsModalProps) {
  const { language } = useAppContext();
  const t = useTranslation(language);

  const [desc, setDesc] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [selectedSubId, setSelectedSubId] = useState<string>('');

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const currentAdjustments = adjustments.filter(a => a.month === currentMonth && a.year === currentYear);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;

    let finalDesc = desc.trim();
    if (!finalDesc && selectedSubId) {
      const sub = subscriptions.find(s => s.id === selectedSubId);
      if (sub) finalDesc = `Ajuste: ${sub.name}`;
    }

    onAdd({
      description: finalDesc || 'Ajuste',
      subscriptionId: selectedSubId || undefined,
      amount,
      currency,
      month: currentMonth,
      year: currentYear
    });

    setDesc('');
    setAmountStr('');
    setSelectedSubId('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto transition-colors">
        <div className="sticky top-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100/50 dark:border-gray-800/50 p-6 flex justify-between items-center z-10 rounded-t-2xl transition-colors">
          <h2 className="text-xl font-serif font-medium text-gray-900 dark:text-white">
            {t('dashboard.adjustments')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            {currentAdjustments.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('dashboard.noAdjustments')}</p>
            ) : (
              currentAdjustments.map(adj => (
                <div key={adj.id} className="flex items-center justify-between p-3 bg-[#fdfbf7] dark:bg-[#121212] rounded-xl border border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{adj.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatCurrency(adj.amount, adj.currency)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${adj.amount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {adj.amount > 0 ? '+' : ''}{formatCurrency(convertCurrency(adj.amount, adj.currency, baseCurrency, exchangeRates), baseCurrency)}
                    </span>
                    <button
                      onClick={() => onRemove(adj.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAdd} className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.addAdjustment')}</h3>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('dashboard.appSpecificAdj') || 'Ajuste para App'}</label>
              <select
                value={selectedSubId}
                onChange={e => setSelectedSubId(e.target.value)}
                className="w-full px-3 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none text-sm dark:text-white"
              >
                <option value="">{t('dashboard.anyApp') || 'Nenhum / Aleatório'}</option>
                {subscriptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('dashboard.adjustmentDesc')}</label>
              <input
                type="text"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Opcional se App for escolhido"
                className="w-full px-3 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none text-sm dark:text-white"
              />
            </div>

            <div className="flex gap-3">
              <div className="space-y-1 flex-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('dashboard.adjustmentAmount')}</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  className="w-full px-3 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none text-sm dark:text-white"
                />
              </div>
              <div className="space-y-1 w-24">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('form.currency')}</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as Currency)}
                  className="w-full px-2 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none text-sm dark:text-white"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 text-sm font-medium text-white bg-[#5A5A40] hover:bg-[#4a4a34] rounded-xl transition-colors shadow-sm dark:bg-[#7a7a5c] dark:hover:bg-[#8a8a6c] flex items-center justify-center gap-2"
            >
              <Plus size={16} /> {t('dashboard.addAdjustment')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
