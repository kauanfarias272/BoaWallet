import React, { useMemo } from 'react';
import { Subscription, Currency, convertCurrency, getMonthlyAmount, getEffectiveTotalCost } from '../types';
import { formatCurrency } from '../lib/utils';

interface Props {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  onEdit: (sub: Subscription) => void;
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function CalendarView({ subscriptions, baseCurrency, exchangeRates, onEdit }: Props) {
  const today = new Date();

  // Build a map: day -> subscriptions due
  const byDay = useMemo(() => {
    const map: Record<number, Subscription[]> = {};
    subscriptions.forEach(sub => {
      if (sub.status?.startsWith('cancelled')) return;
      const day = sub.dueDate;
      if (!day) return;
      if (!map[day]) map[day] = [];
      map[day].push(sub);
    });
    return map;
  }, [subscriptions]);

  // Days with events, sorted
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

  // Total per day
  const totalForDay = (subs: Subscription[]) =>
    subs.reduce((acc, sub) => {
      const eff = getEffectiveTotalCost(sub);
      return acc + convertCurrency(getMonthlyAmount(eff.amount, sub.billingCycle), eff.currency, baseCurrency, exchangeRates);
    }, 0);

  const currentMonth = MONTHS[today.getMonth()];
  const currentYear = today.getFullYear();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          📅 {currentMonth} {currentYear}
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">· vencimentos do mês</span>
      </div>

      {days.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">Nenhum vencimento este mês.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {days.map(day => {
            const subs = byDay[day];
            const total = totalForDay(subs);
            const isPast = day < today.getDate();
            const isToday = day === today.getDate();

            return (
              <div
                key={day}
                className={`rounded-2xl border transition-colors ${
                  isToday
                    ? 'border-[#5A5A40] dark:border-[#c8c89a] bg-[#5A5A40]/5 dark:bg-[#c8c89a]/5'
                    : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1a]'
                }`}
              >
                {/* Day header */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${
                      isToday
                        ? 'bg-[#5A5A40] dark:bg-[#c8c89a] text-white dark:text-[#0f0f0f]'
                        : isPast
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
                    }`}>
                      <span>{day}</span>
                      <span className="text-[8px] font-normal opacity-70">{currentMonth}</span>
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${
                        isToday ? 'text-[#5A5A40] dark:text-[#c8c89a]' : isPast ? 'text-gray-400' : 'text-gray-900 dark:text-white'
                      }`}>
                        {isToday ? 'Hoje' : isPast ? `Dia ${day} (passado)` : `Dia ${day}`}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {subs.length} assinatura{subs.length !== 1 ? 's' : ''} · {formatCurrency(total, baseCurrency)}
                      </p>
                    </div>
                  </div>
                  {isToday && (
                    <span className="text-xs bg-[#5A5A40] dark:bg-[#c8c89a] text-white dark:text-[#0f0f0f] px-2 py-0.5 rounded-full font-medium">Hoje</span>
                  )}
                </div>

                {/* Sub list */}
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {subs.map(sub => {
                    const eff = getEffectiveTotalCost(sub);
                    return (
                      <button
                        key={sub.id}
                        onClick={() => onEdit(sub)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <span className="text-lg">{sub.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            isPast ? 'text-gray-400' : 'text-gray-900 dark:text-white'
                          }`}>{sub.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{sub.category}</p>
                        </div>
                        <p className={`text-sm font-semibold shrink-0 ${
                          isPast ? 'text-gray-400' : 'text-gray-900 dark:text-white'
                        }`}>
                          {formatCurrency(convertCurrency(getMonthlyAmount(eff.amount, sub.billingCycle), eff.currency, baseCurrency, exchangeRates), baseCurrency)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
