import React from 'react';
import { Subscription, getEffectiveTotalCost, Currency } from '../types';
import { formatCurrency } from '../lib/utils';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '../AppContext';

interface CalendarViewProps {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  onEdit: (sub: Subscription) => void;
}

export function CalendarView({ subscriptions, baseCurrency, exchangeRates, onEdit }: CalendarViewProps) {
  const { language } = useAppContext();
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
  const currentDay = today.getDate();

  const monthNamesPt = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthNames = language === 'pt' ? monthNamesPt : monthNamesEn;

  const daysPt = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = language === 'pt' ? daysPt : daysEn;

  // Map subscriptions to days
  const getDailySubs = (day: number) => {
    return subscriptions.filter(sub => {
      // Exclude completely flexible or random single expenses without due date
      if (sub.isFlexibleDate || typeof sub.dueDate !== 'number' || sub.status?.startsWith('cancelled')) return false;

      // Handle due date overflowing the month length (e.g., due 31 but month has 28 days)
      const effectiveDueDate = sub.dueDate > daysInMonth ? daysInMonth : sub.dueDate;
      return effectiveDueDate === day;
    });
  };

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const paddingArray = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm font-sans mb-8">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-medium text-gray-900 dark:text-white flex items-center gap-3">
          <Calendar className="text-blue-600 dark:text-blue-400" />
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-[#222] dark:hover:bg-[#333] rounded-full transition-colors text-gray-700 dark:text-gray-300">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-[#222] dark:hover:bg-[#333] rounded-full transition-colors text-gray-700 dark:text-gray-300">
            {language === 'pt' ? 'Hoje' : 'Today'}
          </button>
          <button onClick={nextMonth} className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-[#222] dark:hover:bg-[#333] rounded-full transition-colors text-gray-700 dark:text-gray-300">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-800 rounded-xl overflow-hidden shadow-inner">
        {/* Day Names */}
        {days.map(day => (
          <div key={day} className="bg-gray-50 dark:bg-[#222] text-center py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {day}
          </div>
        ))}

        {/* Padding Days */}
        {paddingArray.map(i => (
          <div key={`pad-${i}`} className="bg-white dark:bg-[#1a1a1a] min-h-[100px] p-2" />
        ))}

        {/* Actual Days */}
        {daysArray.map(day => {
          const dailySubs = getDailySubs(day);
          const isToday = isCurrentMonth && day === currentDay;

          return (
            <div
              key={day}
              className={`min-h-[100px] p-2 bg-white dark:bg-[#1a1a1a] transition-all hover:bg-gray-50 dark:hover:bg-[#222] ${isToday ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/10 dark:bg-blue-900/10' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-sm font-medium ${isToday ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700 dark:text-gray-300'}`}>
                  {day}
                </span>
                {dailySubs.length > 0 && (
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">
                    {dailySubs.length}
                  </span>
                )}
              </div>
              <div className="space-y-1.5 overflow-y-auto max-h-[120px] pr-1 styled-scrollbar">
                {dailySubs.map(sub => {
                  const costInfo = getEffectiveTotalCost(sub);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => onEdit(sub)}
                      className="cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#fdfbf7] dark:bg-[#252525] hover:bg-gray-100 dark:hover:bg-[#333] border border-gray-100 dark:border-gray-800 transition-colors"
                      title={`${sub.name} - ${formatCurrency(costInfo.amount, costInfo.currency)}`}
                    >
                      <div className="w-5 h-5 rounded-full bg-white dark:bg-[#121212] flex items-center justify-center text-[10px] overflow-hidden shrink-0 shadow-sm border border-gray-100 dark:border-gray-800">
                         {sub.logoUrl ? (
                           <img src={sub.logoUrl} alt={sub.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                         ) : (
                           sub.emoji
                         )}
                      </div>
                      <div className="flex flex-col min-w-0">
                         <span className="text-[11px] font-medium text-gray-900 dark:text-white truncate" style={{ maxWidth: '60px' }}>
                           {sub.name}
                         </span>
                         <span className="text-[9px] text-gray-500 dark:text-gray-400">
                           {formatCurrency(costInfo.amount, costInfo.currency)}
                         </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
