import React from 'react';
import { Subscription, Currency, SharedMember } from '../types';
import { formatCurrency } from '../lib/utils';
import { getEffectiveTotalCost } from '../types';
import { CheckCircle, Clock, Users, ArrowRight, ExternalLink } from 'lucide-react';
import { useAppContext } from '../AppContext';

interface Props {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
}

export function ClientsTab({ subscriptions, baseCurrency, exchangeRates }: Props) {
  const { language } = useAppContext();
  
  // Get all subscriptions that have participants
  const sharedSubs = subscriptions.filter(s => (s.sharedWith?.length ?? 0) > 0);
  
  const today = new Date().getDate();

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="text-[#d0d0a0]" /> 
            {language === 'pt' ? 'Clientes & Divisões' : 'Clients & Splits'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {language === 'pt' ? 'Gerencie quem divide as assinaturas com você.' : 'Manage who shares subscriptions with you.'}
          </p>
        </div>
      </div>

      {sharedSubs.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {sharedSubs.map(sub => {
            const effectiveCost = getEffectiveTotalCost(sub);
            const participants = sub.sharedWith || [];
            const owing = participants.filter(c => !c.paidCurrentMonth && c.paymentDate && c.paymentDate <= today);

            return (
              <div key={sub.id} className="bg-[#111] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                {/* Sub Header */}
                <div className="bg-[#1a1a1a] px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-xl">
                      {sub.logoUrl ? (
                         <img src={sub.logoUrl} className="w-8 h-8 rounded-md object-cover" alt="" referrerPolicy="no-referrer" />
                      ) : sub.emoji}
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">{sub.name}</p>
                      <p className="text-xs text-gray-500">
                        {participants.length} {participants.length === 1 ? 'participante' : 'participantes'} 
                        {' · '} 
                        {formatCurrency(sub.incomeAmount, sub.incomeCurrency)} {language === 'pt' ? 'total de retorno' : 'total return'}
                      </p>
                    </div>
                  </div>
                  {owing.length > 0 && (
                    <span className="text-[10px] bg-red-900/40 text-red-400 border border-red-900/50 px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                      {owing.length} {language === 'pt' ? 'pendente' : 'pending'}
                    </span>
                  )}
                </div>

                {/* Participants List */}
                <div className="divide-y divide-gray-800/50">
                  {participants.map(member => {
                    const isDue = member.paymentDate && member.paymentDate <= today && !member.paidCurrentMonth;
                    return (
                      <div key={member.id} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors group">
                        <div className="flex items-center gap-4 min-w-0">
                          {/* Paid Toggle Status */}
                          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                            member.paidCurrentMonth
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : isDue
                              ? 'border-red-500/50 text-red-400 bg-red-900/10'
                              : 'border-gray-700 text-gray-600'
                          }`}>
                            {member.paidCurrentMonth ? <CheckCircle size={20} /> : isDue ? <Clock size={20} /> : <Users size={16} />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-base font-medium truncate ${
                                member.paidCurrentMonth ? 'text-gray-500' : 'text-white'
                              }`}>{member.name}</p>
                              {member.info && (
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">
                                  {member.info}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 ${
                              isDue ? 'text-red-400 font-medium' : 'text-gray-500'
                            }`}>
                              {language === 'pt' ? 'Pagamento dia' : 'Payment day'} {member.paymentDate || sub.dueDate}
                              {isDue && (language === 'pt' ? ' — Atrasado' : ' — Overdue')}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={`text-base font-bold ${member.paidCurrentMonth ? 'text-gray-500' : 'text-white'}`}>
                            {formatCurrency(member.amount || 0, member.currency || sub.costCurrency)}
                          </p>
                          <p className="text-[10px] text-gray-600 uppercase font-bold">{language === 'pt' ? 'Aporte' : 'Share'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer / Action */}
                <div className="bg-[#151515] p-3 border-t border-gray-800 flex justify-center">
                  <button className="text-xs text-[#d0d0a0] font-bold flex items-center gap-1 hover:underline">
                    {language === 'pt' ? 'Editar na assinatura' : 'Edit in subscription'} <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-[#111] border border-gray-800 border-dashed rounded-3xl">
          <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-gray-600" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">
            {language === 'pt' ? 'Nenhum cliente ainda' : 'No clients yet'}
          </h3>
          <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">
            {language === 'pt' ? 'Abra o formulário de uma assinatura e ative a opção "Dividir com outros" para gerenciar participantes aqui.' : 'Open a subscription form and enable "Split with others" to manage participants here.'}
          </p>
          <button className="bg-[#d0d0a0] text-black px-6 py-2 rounded-full font-bold text-sm hover:scale-105 transition-transform flex items-center gap-2 mx-auto">
             <ExternalLink size={16} /> {language === 'pt' ? 'Ver Assinaturas' : 'View Subscriptions'}
          </button>
        </div>
      )}
    </div>
  );
}
