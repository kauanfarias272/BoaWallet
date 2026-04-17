import React, { useMemo, useState } from 'react';
import { CheckCircle, Clock, ExternalLink, RotateCcw, Users } from 'lucide-react';
import { Subscription, Currency } from '../types';
import { formatCurrency } from '../lib/utils';
import { useAppContext } from '../AppContext';
import { bestLogoUrl } from '../lib/logos';
import { isSharedMemberPaid } from '../lib/sharedMembers';

interface Props {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  onEditSubscription: (subscription: Subscription) => void;
  onSetMemberPaid: (subscriptionId: string, memberId: string, paid: boolean) => Promise<void>;
}

type MemberTab = 'pending' | 'paid';

export function ClientsTab({ subscriptions, onEditSubscription, onSetMemberPaid }: Props) {
  const { language } = useAppContext();
  const [activeTab, setActiveTab] = useState<MemberTab>('pending');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const today = new Date().getDate();
  const tx = (pt: string, en: string, es: string, it: string) =>
    ({ pt, en, es, it }[language] ?? en);

  const sharedSubs = useMemo(() => {
    return subscriptions
      .filter((subscription) => (subscription.sharedWith?.length ?? 0) > 0)
      .map((subscription) => {
        const participants = subscription.sharedWith || [];
        const pendingMembers = participants.filter((member) => !isSharedMemberPaid(member));
        const paidMembers = participants.filter((member) => isSharedMemberPaid(member));
        return {
          subscription,
          participants,
          pendingMembers,
          paidMembers,
        };
      });
  }, [subscriptions]);

  const pendingCount = sharedSubs.reduce((total, item) => total + item.pendingMembers.length, 0);
  const paidCount = sharedSubs.reduce((total, item) => total + item.paidMembers.length, 0);

  const visibleSubs = sharedSubs
    .map((item) => ({
      ...item,
      visibleMembers: activeTab === 'pending' ? item.pendingMembers : item.paidMembers,
    }))
    .filter((item) => item.visibleMembers.length > 0);

  const handleTogglePaid = async (subscriptionId: string, memberId: string, paid: boolean) => {
    const key = `${subscriptionId}:${memberId}:${paid ? 'paid' : 'pending'}`;
    setBusyKey(key);
    try {
      await onSetMemberPaid(subscriptionId, memberId, paid);
    } finally {
      setBusyKey(null);
    }
  };

  const title = tx('Clientes & Divisoes', 'Clients & Splits', 'Clientes y Divisiones', 'Clienti e Divisioni');
  const subtitle = tx(
    'Gerencie quem divide as assinaturas com voce.',
    'Manage who shares subscriptions with you.',
    'Administra quien divide las suscripciones contigo.',
    'Gestisci chi divide gli abbonamenti con te.'
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="text-[#d0d0a0]" />
            {title}
          </h2>
          <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-[#111] border border-gray-800 rounded-2xl">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'pending' ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
        >
          <Clock size={14} />
          {tx('Pendentes', 'Pending', 'Pendientes', 'In sospeso')}
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'pending' ? 'bg-[#0a0a0a]/20 text-[#0a0a0a]' : 'bg-red-900/50 text-red-300'}`}>
            {pendingCount}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('paid')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'paid' ? 'bg-[#d0d0a0] text-[#0a0a0a]' : 'text-gray-500 hover:text-white'}`}
        >
          <CheckCircle size={14} />
          {tx('Pago', 'Paid', 'Pagado', 'Pagato')}
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'paid' ? 'bg-[#0a0a0a]/20 text-[#0a0a0a]' : 'bg-emerald-900/50 text-emerald-300'}`}>
            {paidCount}
          </span>
        </button>
      </div>

      {visibleSubs.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {visibleSubs.map(({ subscription, participants, pendingMembers, visibleMembers }) => {
            const logoUrl = bestLogoUrl(subscription.logoUrl, subscription.name);
            const badgeCount = activeTab === 'pending' ? pendingMembers.length : visibleMembers.length;

            return (
              <div key={subscription.id} className="bg-[#111] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="bg-[#1a1a1a] px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-xl overflow-hidden">
                      {logoUrl ? (
                        <img src={logoUrl} className="w-8 h-8 rounded-md object-contain bg-white p-0.5" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        subscription.emoji
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">{subscription.name}</p>
                      <p className="text-xs text-gray-500">
                        {participants.length}{' '}
                        {participants.length === 1
                          ? tx('participante', 'participant', 'participante', 'partecipante')
                          : tx('participantes', 'participants', 'participantes', 'partecipanti')}
                        {' · '}
                        {formatCurrency(subscription.incomeAmount, subscription.incomeCurrency)} {tx('total de retorno', 'total return', 'retorno total', 'ritorno totale')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border ${activeTab === 'pending' ? 'bg-red-900/40 text-red-400 border-red-900/50' : 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50'}`}>
                    {badgeCount} {activeTab === 'pending'
                      ? tx('pendente', 'pending', 'pendiente', 'in sospeso')
                      : tx('pago', 'paid', 'pagado', 'pagato')}
                  </span>
                </div>

                <div className="divide-y divide-gray-800/50">
                  {visibleMembers.map((member) => {
                    const isPaid = isSharedMemberPaid(member);
                    const isDue = !isPaid && !!member.paymentDate && member.paymentDate <= today;
                    const busy = busyKey === `${subscription.id}:${member.id}:${activeTab === 'pending' ? 'paid' : 'pending'}`;

                    return (
                      <div key={member.id} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${isPaid ? 'bg-emerald-500 border-emerald-500 text-white' : isDue ? 'border-red-500/50 text-red-400 bg-red-900/10' : 'border-gray-700 text-gray-600'}`}>
                            {isPaid ? <CheckCircle size={20} /> : isDue ? <Clock size={20} /> : <Users size={16} />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-base font-medium truncate ${isPaid ? 'text-gray-400' : 'text-white'}`}>
                                {member.name}
                              </p>
                              {member.userId && (
                                <span className="text-[10px] bg-[#2a2a1a] text-[#d0d0a0] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                  {member.username ? `@${member.username}` : tx('usuario', 'user', 'usuario', 'utente')}
                                </span>
                              )}
                              {member.info && (
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">
                                  {member.info}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 ${isDue ? 'text-red-400 font-medium' : isPaid ? 'text-emerald-400' : 'text-gray-500'}`}>
                              {tx('Pagamento dia', 'Payment day', 'Pago el dia', 'Pagamento il giorno')} {member.paymentDate || subscription.dueDate}
                              {isDue && ` - ${tx('Atrasado', 'Overdue', 'Atrasado', 'In ritardo')}`}
                              {isPaid && ` - ${tx('Pago', 'Paid', 'Pagado', 'Pagato')}`}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex flex-col items-end gap-2">
                          <div>
                            <p className={`text-base font-bold ${isPaid ? 'text-emerald-300' : 'text-white'}`}>
                              {formatCurrency(member.amount || 0, member.currency || subscription.costCurrency)}
                            </p>
                            <p className="text-[10px] text-gray-600 uppercase font-bold">{tx('Aporte', 'Share', 'Aporte', 'Quota')}</p>
                          </div>
                          <button
                            onClick={() => handleTogglePaid(subscription.id, member.id, activeTab === 'pending')}
                            disabled={busy}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 ${activeTab === 'pending' ? 'bg-emerald-900/30 border border-emerald-800/50 text-emerald-300 hover:bg-emerald-900/50' : 'bg-gray-800 border border-gray-700 text-gray-300 hover:text-white'}`}
                          >
                            {busy
                              ? '...'
                              : activeTab === 'pending'
                                ? tx('Ja pagou', 'Mark as paid', 'Ya pago', 'Gia pagato')
                                : <span className="inline-flex items-center gap-1"><RotateCcw size={11} /> {tx('Reabrir', 'Reopen', 'Reabrir', 'Riapri')}</span>}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-[#151515] p-3 border-t border-gray-800 flex justify-center">
                  <button onClick={() => onEditSubscription(subscription)} className="text-xs text-[#d0d0a0] font-bold flex items-center gap-1 hover:underline">
                    {tx('Editar na assinatura', 'Edit in subscription', 'Editar en la suscripcion', 'Modifica nell abbonamento')} <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-[#111] border border-gray-800 border-dashed rounded-3xl">
          <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
            {activeTab === 'pending' ? <Clock size={32} className="text-gray-600" /> : <CheckCircle size={32} className="text-gray-600" />}
          </div>
          <h3 className="text-lg font-bold text-white mb-2">
            {activeTab === 'pending'
              ? tx('Nenhum pagamento pendente', 'No pending payments', 'No hay pagos pendientes', 'Nessun pagamento in sospeso')
              : tx('Nenhum pagamento marcado como pago', 'No paid participants yet', 'Aun no hay pagos marcados', 'Nessun pagamento segnato')}
          </h3>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            {activeTab === 'pending'
              ? tx(
                  'Assim que alguem estiver devendo, ele aparece aqui para voce marcar como pago.',
                  'Any pending share will appear here so you can mark it as paid.',
                  'Cualquier division pendiente aparecera aqui para marcarla como pagada.',
                  'Qualsiasi quota in sospeso apparira qui per segnarla come pagata.'
                )
              : tx(
                  'Quando voce confirmar um pagamento, o participante sai da aba pendente e aparece aqui.',
                  'Once you confirm a payment, the participant leaves pending and appears here.',
                  'Cuando confirmes un pago, el participante sale de pendientes y aparece aqui.',
                  'Quando confermi un pagamento, il partecipante esce dai sospesi e appare qui.'
                )}
          </p>
        </div>
      )}
    </div>
  );
}
