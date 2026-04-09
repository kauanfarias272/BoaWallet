import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { Subscription, Currency, convertCurrency, getMonthlyAmount, getSubscriptionTotalCost, getDailyAmount, getYearlyAmount, Adjustment, getEffectiveTotalCost } from '../types';
import { formatCurrency } from '../lib/utils';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';
import { Sparkles, CalendarClock, Activity, UserCircle, PlusCircle } from 'lucide-react';
import { AdjustmentsModal } from './AdjustmentsModal';

const SnakeIcon = ({ className, size = 24 }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 12c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5Z" />
    <path d="M13 7V4a2 2 0 0 0-4 0v3" />
    <circle cx="10" cy="4" r="0.5" fill="currentColor" />
    <circle cx="12" cy="4" r="0.5" fill="currentColor" />
    <path d="M11 2v-1" />
  </svg>
);

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface DashboardProps {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  adjustments: Adjustment[];
  onAddAdjustment: (adj: Omit<Adjustment, 'id'>) => void;
  onRemoveAdjustment: (id: string) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function Dashboard({ subscriptions, baseCurrency, exchangeRates, adjustments, onAddAdjustment, onRemoveAdjustment }: DashboardProps) {
  const { language, user } = useAppContext();
  const t = useTranslation(language);
  const [showAdjustments, setShowAdjustments] = useState(false);

  const { totalCost, totalIncome, netCost, dailyCost, yearlyCost, totalCashback, adjustmentsTotal } = useMemo(() => {
    let cost = 0;
    let income = 0;
    let daily = 0;
    let yearly = 0;
    let cashback = 0;

    subscriptions.forEach(sub => {
      const effectiveCost = getEffectiveTotalCost(sub);
      const monthlyCost = getMonthlyAmount(effectiveCost.amount, sub.billingCycle);
      const costInBase = convertCurrency(monthlyCost, effectiveCost.currency, baseCurrency, exchangeRates);
      cost += costInBase;
      
      const dailyInBase = convertCurrency(getDailyAmount(effectiveCost.amount, sub.billingCycle), effectiveCost.currency, baseCurrency, exchangeRates);
      daily += dailyInBase;
      
      const yearlyInBase = convertCurrency(getYearlyAmount(effectiveCost.amount, sub.billingCycle), effectiveCost.currency, baseCurrency, exchangeRates);
      yearly += yearlyInBase;

      if (sub.hasCashback) {
        const cashbackAmount = monthlyCost * (sub.cashbackPercentage / 100);
        cashback += convertCurrency(cashbackAmount, effectiveCost.currency, baseCurrency, exchangeRates);
      }

      if (sub.hasIncome) {
        const monthlyIncome = getMonthlyAmount(sub.incomeAmount, sub.incomeFrequency);
        income += convertCurrency(monthlyIncome, sub.incomeCurrency, baseCurrency, exchangeRates);
      }
    });

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentAdjustments = adjustments.filter(a => a.month === currentMonth && a.year === currentYear);
    const adjTotal = currentAdjustments.reduce((acc, adj) => acc + convertCurrency(adj.amount, adj.currency, baseCurrency, exchangeRates), 0);

    return {
      totalCost: cost + adjTotal,
      totalIncome: income,
      totalCashback: cashback,
      netCost: cost + adjTotal - income - cashback,
      dailyCost: daily + (adjTotal / 30),
      yearlyCost: yearly + (adjTotal * 12),
      adjustmentsTotal: adjTotal
    };
  }, [subscriptions, baseCurrency, exchangeRates, adjustments]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    subscriptions.forEach(sub => {
      const effectiveCost = getEffectiveTotalCost(sub);
      const monthlyCost = getMonthlyAmount(effectiveCost.amount, sub.billingCycle);
      const costInBase = convertCurrency(monthlyCost, effectiveCost.currency, baseCurrency, exchangeRates);
      const translatedCategory = t(`cat.${sub.category}` as any) === `cat.${sub.category}` ? sub.category : t(`cat.${sub.category}` as any);
      data[translatedCategory] = (data[translatedCategory] || 0) + costInBase;
    });
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: COLORS.slice(0, labels.length),
          borderWidth: 0,
        },
      ],
    };
  }, [subscriptions, baseCurrency, exchangeRates]);

  const currencyData = useMemo(() => {
    const data: Record<string, number> = {};
    subscriptions.forEach(sub => {
      const effectiveCost = getEffectiveTotalCost(sub);
      const monthlyCost = getMonthlyAmount(effectiveCost.amount, sub.billingCycle);
      data[effectiveCost.currency] = (data[effectiveCost.currency] || 0) + monthlyCost;
    });
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    return {
      labels,
      datasets: [
        {
          label: 'Original',
          data: values,
          backgroundColor: '#3b82f6',
          borderRadius: 4,
        },
      ],
    };
  }, [subscriptions]);

  const chartOptions = {
    color: '#9ca3af',
  };

  const getFunFact = (netCost: number, baseCurrency: Currency) => {
    if (netCost <= 0) return null;
    
    const costInUsd = convertCurrency(netCost, baseCurrency, 'USD', exchangeRates);
    
    // Localized prices in USD equivalent
    let coffeePriceUsd = 4;
    let pizzaPriceUsd = 15;

    if (language === 'pt') {
      coffeePriceUsd = 1.0; // R$ 5
      pizzaPriceUsd = 10.0; // R$ 50
    } else if (language === 'it') {
      coffeePriceUsd = 1.6; // € 1.5
      pizzaPriceUsd = 8.5;  // € 8
    } else if (language === 'es') {
      coffeePriceUsd = 2.2; // € 2
      pizzaPriceUsd = 11.0; // € 10
    }
    
    if (costInUsd < 50) {
      const coffees = Math.floor(costInUsd / coffeePriceUsd);
      return t('dashboard.coffeeEquivalent', { coffees: coffees.toString() });
    } else if (costInUsd < 150) {
      const pizzas = Math.floor(costInUsd / pizzaPriceUsd);
      return t('dashboard.pizzaEquivalent', { pizzas: pizzas.toString() });
    } else {
      // Future value of monthly investment over 10 years at 10% annual return
      const r = 0.10 / 12; // monthly interest rate
      const n = 10 * 12; // number of months
      const futureValue = netCost * ((Math.pow(1 + r, n) - 1) / r);
      return t('dashboard.investmentEquivalent', { amount: formatCurrency(futureValue, baseCurrency) });
    }
  };

  const funFact = getFunFact(netCost, baseCurrency);

  // Calculate Health Score (0-100)
  const healthScore = useMemo(() => {
    if (totalCost === 0) return 100;
    if (totalIncome + totalCashback === 0) return 50; // Neutral if no income but has expenses
    const ratio = (totalIncome + totalCashback) / totalCost;
    if (ratio >= 1) return 100;
    return Math.round(50 + (ratio * 50));
  }, [totalCost, totalIncome, totalCashback]);

  // Determine Persona
  const persona = useMemo(() => {
    if (subscriptions.length === 0) return null;
    const categoryTotals: Record<string, number> = {};
    subscriptions.forEach(sub => {
      const effectiveCost = getEffectiveTotalCost(sub);
      categoryTotals[sub.category] = (categoryTotals[sub.category] || 0) + getMonthlyAmount(effectiveCost.amount, sub.billingCycle);
    });
    
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0][0];
    
    const personas: Record<string, string> = {
      'Streaming': 'Rei do Streaming',
      'Software': 'Tech Guru',
      'Games': 'Gamer Pro',
      'Education': 'Estudante Focado',
      'Health': 'Fitness & Saúde',
      'Housing': 'Caseiro',
      'Utilities': 'Essencialista',
      'Subscriptions': 'Assinante Serial',
      'Others': 'Eclético'
    };
    
    return personas[topCategory] || personas['Others'];
  }, [subscriptions]);

  const nextPayment = useMemo(() => {
    if (subscriptions.length === 0) return null;
    
    const today = new Date();
    const currentDay = today.getDate();
    
    // Find the next due date
    let nextSub = null;
    let minDays = 32; // Max days in a month + 1
    
    subscriptions.forEach(sub => {
      let daysUntil = sub.dueDate - currentDay;
      if (daysUntil < 0) {
        // Next month
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        daysUntil = (daysInMonth - currentDay) + sub.dueDate;
      }
      
      if (daysUntil < minDays) {
        minDays = daysUntil;
        nextSub = sub;
      }
    });
    
    return { sub: nextSub, days: minDays };
  }, [subscriptions]);

  return (
    <div className="space-y-6">
      {nextPayment?.sub && (
        <div className="bg-gradient-to-r from-[#5A5A40] to-[#4a4a34] dark:from-[#2a2a20] dark:to-[#1a1a14] rounded-2xl p-4 sm:p-6 shadow-sm text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <CalendarClock size={24} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-white/80 font-medium uppercase tracking-wider mb-0.5">{t('dashboard.nextPayment')}</p>
              <p className="text-lg font-medium">
                {nextPayment.sub.name} <span className="text-white/60 font-normal text-base">({formatCurrency(getSubscriptionTotalCost(nextPayment.sub), nextPayment.sub.costCurrency)})</span>
              </p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-3xl font-serif font-medium">
              {nextPayment.days === 0 ? t('dashboard.today') : nextPayment.days === 1 ? t('dashboard.tomorrow') : t('dashboard.inDays', { days: nextPayment.days.toString() })}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div 
          onClick={() => setShowAdjustments(true)}
          className="bg-white dark:bg-[#1a1a1a] p-6 rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 transition-colors cursor-pointer hover:ring-2 hover:ring-[#5A5A40]/50 dark:hover:ring-[#d0d0a0]/50 relative group"
        >
          <div className="absolute top-4 right-4 text-gray-400 group-hover:text-[#5A5A40] dark:group-hover:text-[#d0d0a0] transition-colors">
            <PlusCircle size={20} />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.monthlyCost')}</p>
            {adjustmentsTotal !== 0 && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${adjustmentsTotal > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                {adjustmentsTotal > 0 ? '+' : ''}{formatCurrency(adjustmentsTotal, baseCurrency)}
              </span>
            )}
          </div>
          <p className="text-4xl font-serif font-medium mt-2 text-gray-900 dark:text-white">{formatCurrency(totalCost, baseCurrency)}</p>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50 dark:border-gray-800/50">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(dailyCost, baseCurrency)}</span> {t('dashboard.perDay')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(yearlyCost, baseCurrency)}</span> {t('dashboard.perYear')}
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 transition-colors">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.monthlyReturn')}</p>
          <p className="text-4xl font-serif font-medium mt-2 text-[#5A5A40] dark:text-[#8a8a6c]">+{formatCurrency(totalIncome + totalCashback, baseCurrency)}</p>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50 dark:border-gray-800/50">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('dashboard.split')} <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(totalIncome, baseCurrency)}</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('dashboard.cashback')} <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(totalCashback, baseCurrency)}</span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 transition-colors flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.netCost')}</p>
            <p className="text-4xl font-serif font-medium mt-2 text-gray-900 dark:text-white">{formatCurrency(netCost, baseCurrency)}</p>
          </div>
          {funFact && (
            <div className="mt-4 p-3 bg-[#fdfbf7] dark:bg-[#222] rounded-xl border border-[#5A5A40]/10 dark:border-[#8a8a6c]/20 flex gap-3 items-start">
              <SnakeIcon className="text-[#5A5A40] dark:text-[#d0d0a0] shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-xs font-medium text-[#5A5A40] dark:text-[#d0d0a0] uppercase tracking-wider mb-0.5">{t('dashboard.funFact')}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">{funFact}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {persona && (
          <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 flex items-center gap-4">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-12 h-12 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
            ) : null}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('app.persona')}</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">{persona}</p>
            </div>
          </div>
        )}
        
        <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
            <Activity size={24} className="text-green-500" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('app.healthScore')}</p>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${healthScore > 70 ? 'bg-green-500' : healthScore > 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
              <span className="text-lg font-medium text-gray-900 dark:text-white">{healthScore}/100</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 transition-colors">
          <h3 className="text-lg font-serif font-medium text-gray-900 dark:text-white mb-6">{t('dashboard.categoryChart')} ({baseCurrency})</h3>
          <div className="h-64 flex items-center justify-center">
            <Pie 
              data={categoryData} 
              options={{ 
                maintainAspectRatio: false,
                color: chartOptions.color,
                plugins: {
                  legend: { 
                    position: 'right',
                    labels: { color: chartOptions.color }
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => ` ${formatCurrency(context.raw as number, baseCurrency)}`
                    }
                  }
                }
              }} 
            />
          </div>
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 transition-colors">
          <h3 className="text-lg font-serif font-medium text-gray-900 dark:text-white mb-6">{t('dashboard.currencyChart')}</h3>
          <div className="h-64">
            <Bar 
              data={currencyData} 
              options={{
                maintainAspectRatio: false,
                color: chartOptions.color,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (context) => ` ${formatCurrency(context.raw as number, context.label)}`
                    }
                  }
                },
                scales: {
                  x: { 
                    grid: { display: false },
                    ticks: { color: chartOptions.color }
                  },
                  y: { 
                    grid: { color: '#374151' }, 
                    border: { display: false },
                    ticks: { color: chartOptions.color }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {showAdjustments && (
        <AdjustmentsModal 
          adjustments={adjustments}
          onAdd={onAddAdjustment}
          onRemove={onRemoveAdjustment}
          onClose={() => setShowAdjustments(false)}
          baseCurrency={baseCurrency}
          exchangeRates={exchangeRates}
        />
      )}
    </div>
  );
}
