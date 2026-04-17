import React, { useState } from 'react';
import { Subscription, Currency, convertCurrency, getMonthlyAmount, getSubscriptionTotalCost, getEffectiveTotalCost } from '../types';
import { formatCurrency } from '../lib/utils';
import { Edit2, Trash2, X, TrendingUp, TrendingDown, Power, Users as UsersIcon, Share2 } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { bestLogoUrl, getClearbitLogoUrl } from '../lib/logos';

function SubscriptionLogo({ sub }: { sub: Subscription }) {
  const [primaryFailed, setPrimaryFailed] = React.useState(false);
  const [clearbitFailed, setClearbitFailed] = React.useState(false);

  // Stage 1: best URL (Clearbit by name, or converted from old favicon, or original)
  const primary = bestLogoUrl(sub.logoUrl, sub.name);

  // Stage 2: direct Clearbit by name (only needed if primary wasn't Clearbit)
  const clearbit = getClearbitLogoUrl(sub.name);

  if (primary && !primaryFailed) {
    return (
      <img
        src={primary}
        alt={sub.name}
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain bg-white p-0.5"
        onError={() => setPrimaryFailed(true)}
      />
    );
  }

  if (clearbit && clearbit !== primary && !clearbitFailed) {
    return (
      <img
        src={clearbit}
        alt={sub.name}
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain bg-white p-0.5"
        onError={() => setClearbitFailed(true)}
      />
    );
  }

  // Final fallback: initials with consistent color
  const initial = (sub.name || sub.emoji || '?').charAt(0).toUpperCase();
  const colors = ['#3b4a2f','#2f3a4a','#4a2f3b','#2f4a3a','#4a3a2f'];
  const colorIdx = initial.charCodeAt(0) % colors.length;
  return (
    <div className="w-full h-full flex items-center justify-center text-[#d0d0a0] font-bold text-base" style={{ background: colors[colorIdx] }}>
      {sub.emoji && sub.emoji !== '📦' ? sub.emoji : initial}
    </div>
  );
}
import { useTranslation } from '../i18n';

interface SubscriptionListProps {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  onEdit: (sub: Subscription) => void;
  onDelete: (id: string) => void;
  onToggleStatus?: (id: string, currentStatus: string) => void;
  onShare?: (sub: Subscription) => void;
}

export function SubscriptionList({ subscriptions, baseCurrency, exchangeRates, onEdit, onDelete, onToggleStatus, onShare }: SubscriptionListProps) {
  const { language } = useAppContext();
  const t = useTranslation(language);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Sort by due date
  const sortedSubs = [...subscriptions].sort((a, b) => a.dueDate - b.dueDate);

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-sm border border-gray-100/50 dark:border-gray-800/50 overflow-hidden transition-colors">
      <div className="p-6 border-b border-gray-100/50 dark:border-gray-800/50 flex justify-between items-center">
        <h3 className="text-xl font-serif font-medium text-gray-900 dark:text-white">{t('list.title')}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#121212] text-xs uppercase tracking-wider text-gray-400">
              <th className="p-4 font-medium">{t('list.service')}</th>
              <th className="p-4 font-medium">{t('list.dueDate')}</th>
              <th className="p-4 font-medium hidden md:table-cell">{t('list.originalCost')}</th>
              <th className="p-4 font-medium hidden lg:table-cell">{t('list.return')}</th>
              <th className="p-4 font-medium">{t('list.netCost')} ({baseCurrency})</th>
              <th className="p-4 font-medium hidden sm:table-cell">{t('list.payment')}</th>
              <th className="p-4 font-medium text-right hidden sm:table-cell">{t('list.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/50 dark:divide-gray-800/50">
            {sortedSubs.map((sub) => {
              const effectiveCost = getEffectiveTotalCost(sub);
              const monthlyCost = getMonthlyAmount(effectiveCost.amount, sub.billingCycle);
              const costInBase = convertCurrency(monthlyCost, effectiveCost.currency, baseCurrency, exchangeRates);
              const isReadOnly = !!sub.isSharedIncoming;
              const sharedOwnerLabel = sub.sharedOwnerUsername
                ? `@${sub.sharedOwnerUsername}`
                : sub.sharedOwnerName || '';

              let incomeInBase = 0;
              let cashbackInBase = 0;

              if (sub.hasIncome) {
                const monthlyIncome = getMonthlyAmount(sub.incomeAmount, sub.incomeFrequency);
                incomeInBase = convertCurrency(monthlyIncome, sub.incomeCurrency, baseCurrency, exchangeRates);
              }

              if (sub.hasCashback) {
                const cashbackAmount = monthlyCost * (sub.cashbackPercentage / 100);
                cashbackInBase = convertCurrency(cashbackAmount, sub.costCurrency, baseCurrency, exchangeRates);
              }

              const netCostInBase = costInBase - incomeInBase - cashbackInBase;

              return (
                <React.Fragment key={sub.id}>
                  <tr
                    className={`hover:bg-[#222] transition-colors group ${isReadOnly ? 'cursor-default' : 'cursor-pointer sm:cursor-default'}`}
                    onClick={() => {
                      if (window.innerWidth < 640 && !isReadOnly) {
                        setSelectedSub(sub);
                      }
                    }}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[#222] flex items-center justify-center text-xl overflow-hidden shrink-0 shadow-sm">
                          <SubscriptionLogo sub={sub} />
                        </div>
                        <div className="hidden sm:block">
                          <p className="font-medium text-white flex items-center gap-2 text-base">
                            {sub.name}
                            {sub.type === 'FixedExpense' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#2a2a20] text-[#d0d0a0]">
                                {t('form.typeFixedExpense')}
                              </span>
                            )}
                            {sub.isPromotional && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                Promo
                              </span>
                            )}
                            {sub.subItems && sub.subItems.length > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                +{sub.subItems.length}
                              </span>
                            )}
                            {isReadOnly && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#2a2a20] text-[#d0d0a0]">
                                Compartilhado
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{t(`cat.${sub.category}` as any) === `cat.${sub.category}` ? sub.category : t(`cat.${sub.category}` as any)}</p>
                          {sharedOwnerLabel && (
                            <p className="text-[10px] text-[#d0d0a0] mt-0.5">de {sharedOwnerLabel}</p>
                          )}
                          {sub.sharedWith && sub.sharedWith.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <UsersIcon size={10} className="text-emerald-400" />
                              <span className="text-[10px] text-emerald-400">{sub.sharedWith.length} {t('list.clients' as any)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-300">
                          {sub.billingCycle === 'Yearly' && sub.dueMonth ? (
                            <>{`${sub.dueDate}/${sub.dueMonth < 10 ? '0' : ''}${sub.dueMonth}`}</>
                          ) : (
                            <>{t('list.day' as any)} {sub.dueDate}</>
                          )}
                        </span>
                        <span className="text-xs text-gray-400">{sub.billingCycle === 'Monthly' ? t('form.monthly') : t('form.yearly')}</span>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex flex-col">
                        {sub.hasEarlyPayDiscount && sub.earlyPayCost && sub.earlyPayCost > 0 ? (
                          <>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(effectiveCost.amount, effectiveCost.currency)}
                            </span>
                            <span className="text-xs text-red-500 line-through">
                              {formatCurrency(sub.costAmount, sub.costCurrency)}
                            </span>
                          </>
                        ) : sub.isPromotional && sub.originalCost ? (
                          <>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(effectiveCost.amount, effectiveCost.currency)}
                            </span>
                            <span className="text-xs text-red-500 line-through">
                              {formatCurrency(sub.originalCost, sub.costCurrency)}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-300">
                            {formatCurrency(effectiveCost.amount, effectiveCost.currency)}
                          </span>
                        )}
                        {sub.subItems && sub.subItems.length > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            (Base: {formatCurrency(sub.hasEarlyPayDiscount && sub.earlyPayCost && sub.earlyPayCost > 0 ? sub.earlyPayCost : sub.costAmount, sub.costCurrency)})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <div className="flex flex-col gap-1">
                        {sub.hasIncome && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                              +{formatCurrency(sub.incomeAmount, sub.incomeCurrency)}
                            </span>
                          </div>
                        )}
                        {sub.hasCashback && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded w-fit">
                              {sub.cashbackPercentage}% CB
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">
                              {formatCurrency(cashbackInBase, baseCurrency)}
                            </span>
                          </div>
                        )}
                        {!sub.hasIncome && !sub.hasCashback && (
                          <span className="text-sm text-gray-400 dark:text-gray-600">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`text-sm font-medium ${netCostInBase < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-300'}`}>
                        {formatCurrency(netCostInBase, baseCurrency)}
                      </span>
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#fdfbf7] dark:bg-[#222] text-gray-800 dark:text-gray-300 border border-gray-100 dark:border-gray-800">
                          {t(`pay.${sub.paymentMethod}` as any) === `pay.${sub.paymentMethod}` ? sub.paymentMethod : t(`pay.${sub.paymentMethod}` as any)}
                        </span>
                      <div className="flex items-center gap-1.5 mt-1">
                          {sub.bankLogoUrl && sub.paymentSource !== 'Outro' && (
                            <img src={bestLogoUrl(sub.bankLogoUrl, sub.paymentSource || '') || ''} alt={sub.paymentSource} referrerPolicy="no-referrer" className="w-4 h-4 rounded-full bg-white object-contain p-0.5" />
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {isReadOnly && sharedOwnerLabel ? `Compartilhado por ${sharedOwnerLabel}` : sub.paymentSource}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right hidden sm:table-cell">
                        {onToggleStatus && !isReadOnly && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleStatus(sub.id, sub.status || 'active'); }}
                            title={sub.status?.startsWith('cancelled') ? t('list.enable' as any) : t('list.disable' as any)}
                            className={`p-2 transition-colors rounded-lg ${sub.status?.startsWith('cancelled') ? 'text-emerald-400 hover:bg-emerald-900/30' : 'text-gray-400 hover:text-orange-400 hover:bg-orange-900/30'}`}
                          >
                            <Power size={16} />
                          </button>
                        )}
                        {onShare && !isReadOnly && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onShare(sub); }}
                            title="Compartilhar"
                            className="p-2 text-gray-400 hover:text-[#d0d0a0] transition-colors rounded-lg hover:bg-[#2a2a1a]"
                          >
                            <Share2 size={16} />
                          </button>
                        )}
                        {!isReadOnly && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEdit(sub); }}
                            className="p-2 text-gray-400 hover:text-blue-400 transition-colors rounded-lg hover:bg-blue-900/30"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                    </td>
                  </tr>
                  {(sub.subItems && sub.subItems.length > 0) || sub.notes || sub.serviceUsername || sub.servicePassword ? (
                    <tr className="bg-[#121212]/50">
                      <td colSpan={7} className="p-0">
                        <div className="pl-20 pr-4 py-3 border-t border-gray-800/50">
                          {(sub.serviceUsername || sub.servicePassword) && (
                            <div className="mb-3">
                              <div className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Acesso:</div>
                              <div className="space-y-1.5">
                                {sub.serviceUsername && (
                                  <p className="text-sm text-gray-300">
                                    <span className="text-gray-500">Login:</span> {sub.serviceUsername}
                                  </p>
                                )}
                                {sub.servicePassword && (
                                  <p className="text-sm text-gray-300">
                                    <span className="text-gray-500">Senha:</span>{' '}
                                    {revealedPasswords[sub.id] ? sub.servicePassword : '••••••••'}
                                    <button
                                      type="button"
                                      onClick={() => setRevealedPasswords((current) => ({ ...current, [sub.id]: !current[sub.id] }))}
                                      className="ml-2 text-xs text-[#d0d0a0] hover:underline"
                                    >
                                      {revealedPasswords[sub.id] ? 'Ocultar' : 'Mostrar'}
                                    </button>
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                          {sub.notes && (
                            <div className="mb-3">
                              <div className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">{t('form.notes')}:</div>
                              <p className="text-sm text-gray-300 whitespace-pre-wrap">{sub.notes}</p>
                            </div>
                          )}
                          {sub.subItems && sub.subItems.length > 0 && (
                            <>
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{t('list.subItems')}:</div>
                              <div className="space-y-2">
                                {sub.subItems.map(item => (
                                  <div key={item.id} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                      <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                                      {item.name}
                                    </span>
                                    <span className="text-gray-900 dark:text-gray-300 font-medium">{formatCurrency(item.costAmount, sub.costCurrency)}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {/* Annual ROI Projection for yearly subs with monthly income */}
                  {sub.billingCycle === 'Yearly' && sub.hasIncome && sub.incomeFrequency === 'Monthly' && sub.incomeAmount > 0 && (() => {
                    const effectiveCost = getEffectiveTotalCost(sub);
                    const annualCost = effectiveCost.amount; // Already yearly
                    const monthlyIncomeInCostCurrency = convertCurrency(sub.incomeAmount, sub.incomeCurrency, effectiveCost.currency, exchangeRates);
                    const annualIncome = monthlyIncomeInCostCurrency * 12;
                    const annualROI = annualIncome - annualCost;
                    const breakEvenMonth = monthlyIncomeInCostCurrency > 0 ? Math.ceil(annualCost / monthlyIncomeInCostCurrency) : 0;
                    const isProfit = annualROI >= 0;

                    return (
                      <tr className="bg-gradient-to-r from-[#fdfbf7]/50 to-[#f0f9f0]/50 dark:from-[#121212]/50 dark:to-[#0f1a0f]/50">
                        <td colSpan={7} className="p-0">
                          <div className="pl-20 pr-4 py-4 border-t border-gray-50 dark:border-gray-800/50">
                            <div className="flex items-center gap-2 mb-3">
                              {isProfit ? (
                                <TrendingUp size={16} className="text-emerald-500" />
                              ) : (
                                <TrendingDown size={16} className="text-red-500" />
                              )}
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t('roi.annualProjection' as any)}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {/* Annual Cost */}
                              <div className="bg-white/60 dark:bg-[#1a1a1a]/60 rounded-xl p-3 border border-gray-100/50 dark:border-gray-800/50">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('roi.annualCost' as any)}</p>
                                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                                  -{formatCurrency(annualCost, effectiveCost.currency)}
                                </p>
                              </div>

                              {/* Annual Income */}
                              <div className="bg-white/60 dark:bg-[#1a1a1a]/60 rounded-xl p-3 border border-gray-100/50 dark:border-gray-800/50">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('roi.annualIncome' as any)}</p>
                                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                  +{formatCurrency(annualIncome, effectiveCost.currency)}
                                </p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                  ({formatCurrency(monthlyIncomeInCostCurrency, effectiveCost.currency)}/mês × 12)
                                </p>
                              </div>

                              {/* Annual ROI */}
                              <div className={`rounded-xl p-3 border ${isProfit ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200/50 dark:border-emerald-800/30' : 'bg-red-50/60 dark:bg-red-900/10 border-red-200/50 dark:border-red-800/30'}`}>
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('roi.annualROI' as any)}</p>
                                <p className={`text-sm font-bold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {isProfit ? '+' : ''}{formatCurrency(annualROI, effectiveCost.currency)}
                                </p>
                                <p className={`text-[10px] font-medium mt-0.5 ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {isProfit ? t('roi.profit' as any) : t('roi.loss' as any)}
                                </p>
                              </div>

                              {/* Break-even Month */}
                              <div className="bg-white/60 dark:bg-[#1a1a1a]/60 rounded-xl p-3 border border-gray-100/50 dark:border-gray-800/50">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('roi.breakEvenMonth' as any)}</p>
                                <p className={`text-sm font-semibold ${breakEvenMonth <= 12 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                  {breakEvenMonth > 0 ? `${breakEvenMonth}°` : '—'}
                                </p>
                                {breakEvenMonth > 0 && breakEvenMonth <= 12 && (
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    {t('roi.profit' as any)} a partir do {breakEvenMonth + 1}° mês
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Month-by-month mini bar */}
                            <div className="mt-3 flex items-center gap-1">
                              {Array.from({ length: 12 }, (_, i) => {
                                const balanceAtMonth = (monthlyIncomeInCostCurrency * (i + 1)) - annualCost;
                                const isPositive = balanceAtMonth >= 0;
                                return (
                                  <div
                                    key={i}
                                    className={`flex-1 h-2 rounded-full transition-colors ${isPositive ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-red-300 dark:bg-red-700'}`}
                                    title={`${t('roi.monthlyProjection' as any, { month: (i + 1).toString(), balance: formatCurrency(balanceAtMonth, effectiveCost.currency) })}`}
                                  />
                                );
                              })}
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-[10px] text-gray-400">Mês 1</span>
                              <span className="text-[10px] text-gray-400">Mês 12</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                </React.Fragment>
              );
            })}
            {sortedSubs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {t('list.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Actions Modal */}
      {selectedSub && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:hidden" onClick={() => setSelectedSub(null)}>
          <div
            className="bg-[#1a1a1a] w-full max-w-sm rounded-3xl p-6 border border-gray-800 animate-in zoom-in-95 duration-200 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#222] flex items-center justify-center text-xl overflow-hidden shrink-0 shadow-sm">
                  <SubscriptionLogo sub={selectedSub} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">{selectedSub.name}</h3>
                  <p className="text-sm text-gray-400">{formatCurrency(getEffectiveTotalCost(selectedSub).amount, getEffectiveTotalCost(selectedSub).currency)}</p>
                </div>
              </div>
              <button onClick={() => setSelectedSub(null)} className="p-2 text-gray-400 hover:text-white bg-[#222] rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {onToggleStatus && !selectedSub.isSharedIncoming && (
                <button
                  onClick={() => { onToggleStatus(selectedSub.id, selectedSub.status || 'active'); setSelectedSub(null); }}
                  className={`flex flex-col items-center justify-center gap-3 p-4 bg-[#222] rounded-2xl hover:bg-[#2a2a2a] transition-colors ${selectedSub.status?.startsWith('cancelled') ? 'text-emerald-400' : 'text-orange-400'}`}
                >
                  <Power size={24} />
                  <span className="text-xs font-medium">{selectedSub.status?.startsWith('cancelled') ? t('list.enable' as any) : t('list.disable' as any)}</span>
                </button>
              )}
              {!selectedSub.isSharedIncoming && (
                <button
                  onClick={() => { onEdit(selectedSub); setSelectedSub(null); }}
                  className="flex flex-col items-center justify-center gap-3 p-4 bg-[#222] rounded-2xl text-blue-400 hover:bg-[#2a2a2a] transition-colors"
                >
                  <Edit2 size={24} />
                  <span className="text-xs font-medium">{t('list.edit' as any)}</span>
                </button>
              )}
            </div>
            {selectedSub.isSharedIncoming && (
              <p className="text-xs text-gray-500 mt-4 text-center">Essa assinatura foi compartilhada com voce e aparece aqui so para acompanhamento.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
