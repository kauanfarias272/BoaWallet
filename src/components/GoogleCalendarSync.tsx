import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Calendar, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Subscription } from '../types';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';

interface GoogleCalendarSyncProps {
  subscriptions: Subscription[];
}

export function GoogleCalendarSync({ subscriptions }: GoogleCalendarSyncProps) {
  const { language } = useAppContext();
  const t = useTranslation(language);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const syncToCalendar = async (accessToken: string) => {
    setIsSyncing(true);
    setSyncStatus('idle');
    setErrorMessage('');

    try {
      const now = new Date();
      
      for (const sub of subscriptions) {
        // Calculate next payment date
        const dueDate = new Date(now.getFullYear(), now.getMonth(), sub.dueDate);
        if (dueDate < now) {
          dueDate.setMonth(dueDate.getMonth() + 1);
        }

        const start = dueDate.toISOString();
        const end = new Date(dueDate.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour duration

        const event = {
          summary: `${sub.name} will be pay today`,
          description: `Lembrete criado pelo app\nCusto: ${sub.costAmount} ${sub.costCurrency}`,
          start: { dateTime: start },
          end: { dateTime: end },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 10 }
            ]
          }
        };

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        });

        if (!response.ok) {
          throw new Error('Failed to create event');
        }
      }

      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 5000);
    } catch (error) {
      console.error('Error syncing to calendar:', error);
      setSyncStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSyncing(false);
    }
  };

  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => syncToCalendar(tokenResponse.access_token),
    onError: (error) => {
      console.error('Login Failed:', error);
      setSyncStatus('error');
      setErrorMessage('Login failed');
    },
    scope: 'https://www.googleapis.com/auth/calendar.events',
  });

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => login()}
        disabled={isSyncing || subscriptions.length === 0}
        className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSyncing ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Calendar size={16} className="text-blue-500" />
        )}
        <span className="hidden sm:inline">
          {isSyncing ? t('app.syncing') || 'Sincronizando...' : t('app.connectCalendar') || 'Conectar Google Calendar'}
        </span>
      </button>

      {syncStatus === 'success' && (
        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={14} />
          <span>{t('app.syncSuccess') || 'Sincronizado com sucesso!'}</span>
        </div>
      )}
      
      {syncStatus === 'error' && (
        <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={14} />
          <span>{errorMessage || 'Erro ao sincronizar'}</span>
        </div>
      )}
    </div>
  );
}
