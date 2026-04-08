import React, { useMemo } from 'react';
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
import { Subscription, Currency, convertCurrency, getMonthlyAmount, getSubscriptionTotalCost, getDailyAmount, getYearlyAmount } from '../types';
import { formatCurrency } from '../lib/utils';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface DashboardProps {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function Dashboard({ subscriptions, baseCurrency, exchangeRates }: DashboardProps) {
  const { language, theme } = useAppContext();
  const t = useTranslation(language);

  const { totalCost, totalIncome, netCost, dailyCost, yearlyCost, totalCashback } = useMemo(() => {
    let cost = 0;
    let income = 0;
    let daily = 0;
    let yearly = 0;
    let cashback = 0;

    subscriptions.forEach(sub => {
      const subTotalCost = getSubscriptionTotalCost(sub);
      const monthlyCost = getMonthlyAmount(subTotalCost, sub.billingCycle);
      const costInBase = convertCurrency(monthlyCost, sub.costCurrency, baseCurrency, exchangeRates);
      cost += costInBase;
      
      const dailyInBase = convertCurrency(getDailyAmount(subTotalCost, sub.billingCycle), sub.costCurrency, baseCurrency, exchangeRates);
      daily += dailyInBase;
      
      const yearlyInBase = convertCurrency(getYearlyAmount(subTotalCost, sub.billingCycle), sub.costCurrency, baseCurrency, exchangeRates);
      yearly += yearlyInBase;

      if (sub.hasCashback) {
        const cashbackAmount = monthlyCost * (sub.cashbackPercentage / 100);
        cashback += convertCurrency(cashbackAmount, sub.costCurrency, baseCurrency, exchangeRates);
      }

      if (sub.hasIncome) {
        const monthlyIncome = getMonthlyAmount(sub.incomeAmount, sub.incomeFrequency);
        income += convertCurrency(monthlyIncome, sub.incomeCurrency, baseCurrency, exchangeRates);
      }
    });

    return {
      totalCost: cost,
      totalIncome: income,
      totalCashback: cashback,
      netCost: cost - income - cashback,
      dailyCost: daily,
      yearlyCost: yearly,
    };
  }, [subscriptions, baseCurrency, exchangeRates]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    subscriptions.forEach(sub => {
      const subTotalCost = getSubscriptionTotalCost(sub);
      const monthlyCost = getMonthlyAmount(subTotalCost, sub.billingCycle);
      const costInBase = convertCurrency(monthlyCost, sub.costCurrency, baseCurrency, exchangeRates);
      data[sub.category] = (data[sub.category] || 0) + costInBase;
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
      const subTotalCost = getSubscriptionTotalCost(sub);
      const monthlyCost = getMonthlyAmount(subTotalCost, sub.billingCycle);
      data[sub.costCurrency] = (data[sub.costCurrency] || 0) + monthlyCost;
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
    color: theme === 'dark' ? '#9ca3af' : '#4b5563',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.monthlyCost')}</p>
          <p className="text-4xl font-light mt-2 text-gray-900 dark:text-white">{formatCurrency(totalCost, baseCurrency)}</p>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(dailyCost, baseCurrency)}</span> {t('dashboard.perDay')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(yearlyCost, baseCurrency)}</span> {t('dashboard.perYear')}
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.monthlyReturn')}</p>
          <p className="text-4xl font-light mt-2 text-emerald-600 dark:text-emerald-400">+{formatCurrency(totalIncome + totalCashback, baseCurrency)}</p>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('dashboard.split')} <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(totalIncome, baseCurrency)}</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('dashboard.cashback')} <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(totalCashback, baseCurrency)}</span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('dashboard.netCost')}</p>
          <p className="text-4xl font-light mt-2 text-gray-900 dark:text-white">{formatCurrency(netCost, baseCurrency)}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('dashboard.outOfPocket')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">{t('dashboard.categoryChart')} ({baseCurrency})</h3>
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

        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">{t('dashboard.currencyChart')}</h3>
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
                    grid: { color: theme === 'dark' ? '#374151' : '#f3f4f6' }, 
                    border: { display: false },
                    ticks: { color: chartOptions.color }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
