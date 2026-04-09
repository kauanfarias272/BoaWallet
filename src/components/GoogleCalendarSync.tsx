import React from 'react';
import { Calendar } from 'lucide-react';
import { Subscription, getEffectiveTotalCost } from '../types';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';
import { formatCurrency } from '../lib/utils';

interface GoogleCalendarSyncProps {
  subscriptions: Subscription[];
}

export function GoogleCalendarSync({ subscriptions }: GoogleCalendarSyncProps) {
  const { language } = useAppContext();
  const t = useTranslation(language);

  const generateGenericICS = () => {
    let icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nCALSCALE:GREGORIAN\n`;
    const now = new Date();

    // Support all active subscriptions
    subscriptions.filter(s => s.status !== 'cancelled').forEach(sub => {
      const dueDate = new Date(now.getFullYear(), now.getMonth(), sub.dueDate);
      if (dueDate < now) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      const start = dueDate.toISOString().replace(/-|:|\.\d+/g, '');
      const end = new Date(dueDate.getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');

      icsContent += `BEGIN:VEVENT\n`;
      icsContent += `DTSTART:${start}\n`;
      icsContent += `DTEND:${end}\n`;
      icsContent += `SUMMARY:BoaWallet: ${sub.name}\n`;
      icsContent += `DESCRIPTION:Cost: ${formatCurrency(getEffectiveTotalCost(sub).amount, getEffectiveTotalCost(sub).currency)}. ${sub.notes ? `\\n\\nNotes: ${sub.notes}` : ''}\n`;
      icsContent += `RRULE:FREQ=${sub.billingCycle === 'Monthly' ? 'MONTHLY' : 'YEARLY'}\n`;
      icsContent += `END:VEVENT\n`;
    });

    icsContent += `END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `boawallet_calendario.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={generateGenericICS}
        disabled={subscriptions.length === 0}
        className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Calendar size={16} className="text-emerald-500" />
        <span className="hidden sm:inline">
          {language === 'pt' ? 'Sincronizar (Proton/Apple Sync)' : 'Export Sync ICS'}
        </span>
      </button>
    </div>
  );
}
