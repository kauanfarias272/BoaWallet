import React, { useState } from 'react';
import { Subscription, Currency } from '../types';
import { formatCurrency } from '../lib/utils';
import { convertCurrency, getMonthlyAmount, getEffectiveTotalCost } from '../types';
import { Plus, Trash2, Bell, CheckCircle, Clock } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  paymentDate?: number; // day 1-31
  paid: boolean;
  subscriptionId: string;
}

interface ClientGroup {
  subscriptionId: string;
  clients: Client[];
}

interface Props {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
}

export function ClientsTab({ subscriptions, baseCurrency, exchangeRates }: Props) {
  const sharedSubs = subscriptions.filter(s => (s.sharedWith?.length ?? 0) > 0 || true);

  const [groups, setGroups] = useState<ClientGroup[]>(() => {
    try { return JSON.parse(localStorage.getItem('boa_clients') || '[]'); } catch { return []; }
  });
  const [selectedSub, setSelectedSub] = useState<string>('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientDate, setNewClientDate] = useState<number | ''>('');

  const save = (updated: ClientGroup[]) => {
    setGroups(updated);
    localStorage.setItem('boa_clients', JSON.stringify(updated));
  };

  const getGroup = (subId: string): Client[] =>
    groups.find(g => g.subscriptionId === subId)?.clients || [];

  const addClient = () => {
    if (!selectedSub || !newClientName.trim()) return;
    const client: Client = {
      id: Date.now().toString(),
      name: newClientName.trim(),
      paymentDate: newClientDate !== '' ? Number(newClientDate) : undefined,
      paid: false,
      subscriptionId: selectedSub,
    };
    const existing = groups.find(g => g.subscriptionId === selectedSub);
    if (existing) {
      save(groups.map(g => g.subscriptionId === selectedSub ? { ...g, clients: [...g.clients, client] } : g));
    } else {
      save([...groups, { subscriptionId: selectedSub, clients: [client] }]);
    }
    setNewClientName('');
    setNewClientDate('');
  };

  const removeClient = (subId: string, clientId: string) => {
    save(groups.map(g => g.subscriptionId === subId ? { ...g, clients: g.clients.filter(c => c.id !== clientId) } : g));
  };

  const togglePaid = (subId: string, clientId: string) => {
    save(groups.map(g => g.subscriptionId === subId
      ? { ...g, clients: g.clients.map(c => c.id === clientId ? { ...c, paid: !c.paid } : c) }
      : g
    ));
  };

  const today = new Date().getDate();

  const allSubscribedSubs = subscriptions.filter(s => groups.some(g => g.subscriptionId === s.id && g.clients.length > 0));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">👥 Clientes por Assinatura</h2>

      {/* Add client form */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 space-y-3">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Adicionar cliente</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={selectedSub}
            onChange={e => setSelectedSub(e.target.value)}
            className="col-span-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white"
          >
            <option value="">Selecionar assinatura...</option>
            {subscriptions.map(s => (
              <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Nome do cliente"
            value={newClientName}
            onChange={e => setNewClientName(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min={1} max={31}
              placeholder="Dia pagamento"
              value={newClientDate}
              onChange={e => setNewClientDate(e.target.value ? Number(e.target.value) : '')}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <button
              onClick={addClient}
              className="flex items-center gap-1 px-4 py-2 bg-[#5A5A40] dark:bg-[#c8c89a] text-white dark:text-[#0f0f0f] rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={15} /> Adicionar
            </button>
          </div>
        </div>
      </div>

      {/* Client groups */}
      {subscriptions.map(sub => {
        const clients = getGroup(sub.id);
        if (clients.length === 0) return null;
        const effectiveCost = getEffectiveTotalCost(sub);
        const monthlyCost = getMonthlyAmount(effectiveCost.amount, sub.billingCycle);
        const costPerClient = clients.length > 0 ? monthlyCost / (clients.length + 1) : monthlyCost;
        const owing = clients.filter(c => !c.paid && c.paymentDate && c.paymentDate <= today);

        return (
          <div key={sub.id} className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{sub.emoji}</span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{sub.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {clients.length} cliente{clients.length !== 1 ? 's' : ''} · cada um paga ~{formatCurrency(costPerClient, effectiveCost.currency)}/mês
                  </p>
                </div>
              </div>
              {owing.length > 0 && (
                <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded-full font-medium">
                  {owing.length} devendo
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {clients.map(client => {
                const isDue = client.paymentDate && client.paymentDate <= today && !client.paid;
                return (
                  <div key={client.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => togglePaid(sub.id, client.id)}
                        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
                          client.paid
                            ? 'bg-green-500 border-green-500 text-white'
                            : isDue
                            ? 'border-red-400 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'border-gray-300 dark:border-gray-600 hover:border-[#5A5A40] dark:hover:border-[#c8c89a]'
                        }`}
                      >
                        {client.paid ? <CheckCircle size={14} /> : isDue ? <Clock size={12} /> : null}
                      </button>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          client.paid ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'
                        }`}>{client.name}</p>
                        {client.paymentDate && (
                          <p className={`text-xs ${
                            isDue ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            Paga dia {client.paymentDate}{isDue ? ' — vencido' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isDue && (
                        <button
                          onClick={() => {
                            if ('Notification' in window && Notification.permission === 'granted') {
                              new Notification('Boa Wallet', { body: `Lembrete: ${client.name} precisa pagar ${sub.name}` });
                            }
                          }}
                          className="p-1.5 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                          title="Enviar lembrete"
                        >
                          <Bell size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => removeClient(sub.id, client.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">Adicione clientes que dividem uma assinatura com você.</p>
        </div>
      )}
    </div>
  );
}
