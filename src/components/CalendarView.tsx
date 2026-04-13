import React, { useMemo, useState } from 'react';
import { Subscription, Currency, convertCurrency, getMonthlyAmount, getEffectiveTotalCost } from '../types';
import { formatCurrency } from '../lib/utils';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useAppContext } from '../AppContext';

interface Props {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  onEdit: (sub: Subscription) => void;
}

export function CalendarView({ subscriptions, baseCurrency, exchangeRates, onEdit }: Props) {
  const { language } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const monthNamesPt = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthNames = language === 'pt' ? monthNamesPt : monthNamesEn;

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // Build events map: day -> subscriptions
  const eventsMap = useMemo(() => {
    const map: Record<number, Subscription[]> = {};
    subscriptions.forEach(sub => {
      if (sub.isFlexibleDate || typeof sub.dueDate !== 'number' || sub.status?.startsWith('cancelled_permanent')) return;
      
      // Yearly sub check
      if (sub.billingCycle === 'Yearly' && sub.dueMonth) {
        if (sub.dueMonth !== (currentDate.getMonth() + 1)) return;
      }
      
      const day = sub.dueDate > daysInMonth ? daysInMonth : sub.dueDate;
      if (!map[day]) map[day] = [];
      map[day].push(sub);
    });
    return map;
  }, [subscriptions, currentDate, daysInMonth]);

  const eventDays = Object.keys(eventsMap).map(Number).sort((a, b) => a - b);
  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-gray-800 p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#d0d0a0]/10 flex items-center justify-center">
              <Calendar className="text-[#d0d0a0]" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <p className="text-xs text-gray-400">
                {eventDays.length} {language === 'pt' ? 'datas com pagamentos' : 'payment dates'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-gray-300">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-gray-300">
              {language === 'pt' ? 'Hoje' : 'Today'}
            </button>
            <button onClick={nextMonth} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-gray-300">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Event List */}
      {eventDays.length === 0 ? (
        <div className="bg-[#1a1a1a] rounded-2xl border border-gray-800 p-12 text-center shadow-lg">
          <Calendar size={40} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">
            {language === 'pt' ? 'Nenhum pagamento neste mês' : 'No payments this month'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {eventDays.map(day => {
            const subs = eventsMap[day];
            const isToday = isCurrentMonth && day === today.getDate();
            const isPast = isCurrentMonth && day < today.getDate();

            return (
              <div key={day} className={`bg-[#1a1a1a] rounded-2xl border ${isToday ? 'border-[#d0d0a0] ring-1 ring-[#d0d0a0]/30 shadow-[#d0d0a0]/5' : 'border-gray-800'} shadow-lg overflow-hidden transition-all hover:border-gray-700`}>
                <div className={`px-5 py-3 flex items-center justify-between ${isToday ? 'bg-[#d0d0a0]/5' : isPast ? 'bg-black/20' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${isToday ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'bg-gray-800 text-gray-400'}`}>
                      {day}
                    </div>
                    <div>
                      <span className={`text-sm font-bold ${isToday ? 'text-[#d0d0a0]' : 'text-gray-300'}`}>
                        {language === 'pt' ? 'Dia' : 'Day'} {day}
                      </span>
                      {isToday && <span className="ml-2 text-[10px] bg-[#d0d0a0] text-[#0a0a0a] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">HOJE</span>}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-black/30 px-2 py-1 rounded-lg">
                    {subs.length} {subs.length === 1 ? (language === 'pt' ? 'pagamento' : 'payment') : (language === 'pt' ? 'pagamentos' : 'payments')}
                  </span>
                </div>

                <div className="divide-y divide-gray-800/50">
                  {subs.map(sub => {
                    const cost = getEffectiveTotalCost(sub);
                    const isPaused = sub.status === 'cancelled_temporary';
                    
                    return (
                      <div key={sub.id} onClick={() => onEdit(sub)} className={`px-5 py-3 hover:bg-white/5 cursor-pointer transition-colors flex items-center justify-between ${isPaused ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-xl overflow-hidden border border-gray-700">
                             {sub.logoUrl ? <img src={sub.logoUrl} className="w-full h-full object-cover" alt="" /> : <span>{sub.emoji}</span>}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white flex items-center gap-2">
                              {sub.name}
                              {isPaused && <span className="text-[9px] bg-orange-950 text-orange-400 px-1.5 py-0.5 rounded border border-orange-900/50">PAUSADO</span>}
                            </p>
                            <p className="text-xs text-gray-500">{sub.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-white">{formatCurrency(cost.amount, cost.currency)}</p>
                          <p className="text-[10px] text-gray-500">{sub.paymentSource || 'Assinatura'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Flexible Date Support */}
      {(() => {
        const flex = subscriptions.filter(s => s.isFlexibleDate && !s.status?.startsWith('cancelled_permanent'));
        if (flex.length === 0) return null;
        return (
          <div className="bg-[#1a1a1a] rounded-2xl border border-dashed border-gray-800 p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4 text-orange-400">
              <Clock size={16} />
              <span className="text-sm font-bold uppercase tracking-wider">{language === 'pt' ? 'Data Flexível' : 'Flexible Date'}</span>
            </div>
            <div className="space-y-3">
              {flex.map(sub => {
                const cost = getEffectiveTotalCost(sub);
                return (
                  <div key={sub.id} onClick={() => onEdit(sub)} className="flex items-center justify-between p-3 rounded-xl bg-black/20 hover:bg-black/40 cursor-pointer transition-all border border-transparent hover:border-gray-800">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{sub.emoji}</span>
                      <span className="text-sm font-medium">{sub.name}</span>
                    </div>
                    <span className="text-sm font-bold">{formatCurrency(cost.amount, cost.currency)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
