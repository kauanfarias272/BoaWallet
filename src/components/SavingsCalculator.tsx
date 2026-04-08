import React, { useState, useMemo } from 'react';
import { Subscription, Currency, convertCurrency, getMonthlyAmount, getSubscriptionTotalCost } from '../types';
import { formatCurrency } from '../lib/utils';
import { Calculator } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';

interface SavingsCalculatorProps {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
}

export function SavingsCalculator({ subscriptions, baseCurrency, exchangeRates }: SavingsCalculatorProps) {
  const { language } = useAppContext();
  const t = useTranslation(language);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const { monthlySavings, yearlySavings } = useMemo(() => {
    let monthly = 0;
    subscriptions.forEach(sub => {
      if (selectedIds.has(sub.id)) {
        const subTotalCost = getSubscriptionTotalCost(sub);
        const monthlyCost = getMonthlyAmount(subTotalCost, sub.billingCycle);
        const costInBase = convertCurrency(monthlyCost, sub.costCurrency, baseCurrency, exchangeRates);
        
        let incomeInBase = 0;
        let cashbackInBase = 0;

        if (sub.hasIncome) {
          const monthlyIncome = getMonthlyAmount(sub.incomeAmount, sub.incomeFrequency);
          incomeInBase = convertCurrency(monthlyIncome, sub.incomeCurrency, baseCurrency, exchangeRates);
        }

        if (sub.hasCashback) {
          const cashbackAmount = monthlyCost * (sub.cashbackPercentage / 100);
          cashbackInBase = convertCurrency(cashbackAmount, sub.costCurrency, baseCurrency, exchangeRates);
        }
        
        // If we cut it, we save the net cost (if it was costing us money)
        monthly += (costInBase - incomeInBase - cashbackInBase);
      }
    });

    return {
      monthlySavings: monthly,
      yearlySavings: monthly * 12
    };
  }, [subscriptions, selectedIds, baseCurrency, exchangeRates]);

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
          <Calculator size={24} />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('calc.title')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('calc.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {subscriptions.map(sub => {
            const subTotalCost = getSubscriptionTotalCost(sub);
            return (
              <label 
                key={sub.id} 
                className={`flex items-center p-3 rounded-xl border cursor-pointer transition-colors ${
                  selectedIds.has(sub.id) 
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <input 
                  type="checkbox" 
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 focus:ring-blue-500"
                  checked={selectedIds.has(sub.id)}
                  onChange={() => toggleSelection(sub.id)}
                />
                <div className="ml-3 flex-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {sub.logoUrl ? (
                      <img src={sub.logoUrl} alt={sub.name} referrerPolicy="no-referrer" className="w-5 h-5 rounded-full object-cover bg-white" />
                    ) : (
                      <span>{sub.emoji}</span>
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-200">{sub.name}</span>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatCurrency(convertCurrency(getMonthlyAmount(subTotalCost, sub.billingCycle), sub.costCurrency, baseCurrency, exchangeRates), baseCurrency)}/mês
                  </span>
                </div>
              </label>
            );
          })}
          {subscriptions.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('calc.empty')}</p>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 flex flex-col justify-center transition-colors">
          <div className="text-center space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('calc.monthlySavings')}</p>
              <p className={`text-4xl font-light mt-2 ${monthlySavings > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                {formatCurrency(monthlySavings, baseCurrency)}
              </p>
            </div>
            <div className="h-px bg-gray-200 dark:bg-gray-700 w-1/2 mx-auto"></div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('calc.yearlySavings')}</p>
              <p className={`text-4xl font-light mt-2 ${yearlySavings > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                {formatCurrency(yearlySavings, baseCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
