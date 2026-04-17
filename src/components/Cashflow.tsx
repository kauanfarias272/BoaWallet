import React, { useState } from 'react';
import { Subscription, Currency, convertCurrency, getEffectiveTotalCost } from '../types';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';
import { TrendingUp, TrendingDown, X, EyeOff } from 'lucide-react';
import { bestLogoUrl } from '../lib/logos';

interface CashflowProps {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<string, number>;
}

export function Cashflow({ subscriptions, baseCurrency, exchangeRates }: CashflowProps) {
  const { language } = useAppContext();
  const t = useTranslation(language);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());

  const toggleIgnore = (id: string) => {
    setIgnoredIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getMonthlyValue = (amount: number, currency: Currency, cycle: string) => {
    const monthlyAmount = cycle === 'Yearly' ? amount / 12 : amount;
    return convertCurrency(monthlyAmount, currency, baseCurrency, exchangeRates as Record<Currency, number>);
  };

  const getConfirmedSharedIncome = (sub: Subscription) => {
    const confirmedMembers = (sub.sharedWith || []).filter((member) => !member.userId || !!member.accepted);
    if (confirmedMembers.length === 0) return sub.hasIncome ? getMonthlyValue(sub.incomeAmount, sub.incomeCurrency, sub.incomeFrequency) : 0;

    const confirmedAmount = confirmedMembers.reduce((total, member) => {
      return total + convertCurrency(
        Number(member.amount || 0),
        member.currency || sub.costCurrency,
        sub.incomeCurrency || sub.costCurrency,
        exchangeRates as Record<Currency, number>
      );
    }, 0);

    return getMonthlyValue(confirmedAmount, sub.incomeCurrency || sub.costCurrency, sub.incomeFrequency || sub.billingCycle);
  };

  const formatCurrency = (amount: number) => {
    const safeAmount = Number(amount) || 0;
    if (baseCurrency === 'BTC' || baseCurrency === 'SATS') {
      return `${baseCurrency === 'BTC' ? '₿' : 'SATS'} ${safeAmount.toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: baseCurrency === 'BTC' ? 8 : 0, maximumFractionDigits: baseCurrency === 'BTC' ? 8 : 0 })}`;
    }
    return new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
      style: 'currency',
      currency: baseCurrency
    }).format(safeAmount);
  };

  const items = subscriptions.map(sub => {
    const effectiveCost = getEffectiveTotalCost(sub);
    const monthlyCost = getMonthlyValue(effectiveCost.amount, effectiveCost.currency, sub.billingCycle);
    const monthlyIncome = sub.hasIncome ? getConfirmedSharedIncome(sub) : 0;
    const netValue = monthlyIncome - monthlyCost;
    return { ...sub, netValue, resolvedLogoUrl: bestLogoUrl(sub.logoUrl, sub.name) };
  });

  const activeItems = items.filter(item => !ignoredIds.has(item.id));
  const ignoredItems = items.filter(item => ignoredIds.has(item.id));

  const profitable = activeItems.filter(item => item.netValue > 0).sort((a, b) => b.netValue - a.netValue);
  const expenses = activeItems.filter(item => item.netValue <= 0).sort((a, b) => a.netValue - b.netValue);

  const totalProfitable = profitable.reduce((acc, item) => acc + item.netValue, 0);
  const totalExpenses = expenses.reduce((acc, item) => acc + Math.abs(item.netValue), 0);
  const totalIgnored = ignoredItems.reduce((acc, item) => acc + item.netValue, 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Entradas */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-sm border border-gray-100/50 dark:border-gray-800/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <TrendingUp size={24} />
          </div>
          <div>
            <h3 className="text-xl font-serif font-medium text-gray-900 dark:text-white">{t('cashflow.incomes')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('cashflow.incomesDesc')}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          {profitable.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">{t('cashflow.noIncomes')}</p>
          ) : (
            profitable.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-[#fdfbf7] dark:bg-[#121212] rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  {item.resolvedLogoUrl ? (
                    <img src={item.resolvedLogoUrl} alt={item.name} className="w-8 h-8 rounded-full bg-white object-contain p-0.5" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-2xl">{item.emoji}</span>
                  )}
                  <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(item.netValue)}
                  </span>
                  <button 
                    onClick={() => toggleIgnore(item.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Remover da contagem"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <span className="font-medium text-gray-500 dark:text-gray-400">{t('cashflow.totalPositive')}</span>
          <span className="text-2xl font-serif font-medium text-emerald-600 dark:text-emerald-400">
            +{formatCurrency(totalProfitable)}
          </span>
        </div>
      </div>

      {/* Saídas */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-sm border border-gray-100/50 dark:border-gray-800/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl">
            <TrendingDown size={24} />
          </div>
          <div>
            <h3 className="text-xl font-serif font-medium text-gray-900 dark:text-white">{t('cashflow.expenses')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('cashflow.expensesDesc')}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          {expenses.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">{t('cashflow.noExpenses')}</p>
          ) : (
            expenses.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-[#fdfbf7] dark:bg-[#121212] rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  {item.resolvedLogoUrl ? (
                    <img src={item.resolvedLogoUrl} alt={item.name} className="w-8 h-8 rounded-full bg-white object-contain p-0.5" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-2xl">{item.emoji}</span>
                  )}
                  <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-red-600 dark:text-red-400">
                    -{formatCurrency(Math.abs(item.netValue))}
                  </span>
                  <button 
                    onClick={() => toggleIgnore(item.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Remover da contagem"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <span className="font-medium text-gray-500 dark:text-gray-400">{t('cashflow.totalNegative')}</span>
          <span className="text-2xl font-serif font-medium text-red-600 dark:text-red-400">
            -{formatCurrency(totalExpenses)}
          </span>
        </div>
      </div>
      </div>

      {/* Não Contabilizadas */}
      {ignoredItems.length > 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-sm border border-gray-100/50 dark:border-gray-800/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl">
                <EyeOff size={24} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-medium text-gray-900 dark:text-white">{t('cashflow.unaccounted')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{ignoredItems.length} {ignoredItems.length === 1 ? 'item removido' : 'itens removidos'}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Impacto Total</span>
              <span className={`text-xl font-serif font-medium ${totalIgnored > 0 ? 'text-emerald-600 dark:text-emerald-400' : totalIgnored < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {totalIgnored > 0 ? '+' : ''}{formatCurrency(totalIgnored)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {ignoredItems.map(item => (
              <button
                key={item.id}
                onClick={() => toggleIgnore(item.id)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#fdfbf7] dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-full text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Restaurar"
              >
                {item.resolvedLogoUrl ? (
                  <img src={item.resolvedLogoUrl} alt={item.name} className="w-4 h-4 rounded-full bg-white object-contain p-0.5" referrerPolicy="no-referrer" />
                ) : (
                  <span>{item.emoji}</span>
                )}
                <span className="text-gray-600 dark:text-gray-300">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
