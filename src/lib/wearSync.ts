/**
 * BoaWallet → Wear OS Sync
 *
 * Envia dados do usuário e assinaturas ao app do relógio via WearBridgePlugin.
 * Só executa em plataforma Android nativa.
 */
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';
import type { Subscription } from '../types';

interface WearBridgePlugin {
  pushToWatch(options: { userJson: string; subsJson: string }): Promise<void>;
}

const WearBridge = registerPlugin<WearBridgePlugin>('WearBridge');

export interface WearUserPayload {
  isAuthenticated: boolean;
  userId: string;
  userHandle: string;
  userName: string;
  baseCurrency: string;
  totalMonthlyCost: number;
  totalMonthlyIncome: number;
  netMonthlyCost: number;
  subscriptionCount: number;
  nextDueName: string;
  nextDueDate: number;
  nextDueAmount: number;
  nextDueCurrency: string;
  lastSyncTimestamp: number;
}

/**
 * Calcula o resumo mensal e envia ao relógio.
 * Chamada após login, logout e alterações em assinaturas.
 */
export async function syncToWatch(
  user: { id: string; user_metadata?: { full_name?: string } } | null,
  userHandle: string,
  subscriptions: Subscription[],
  baseCurrency: string,
  exchangeRates: Record<string, number>,
): Promise<void> {
  // Só funciona em Android nativo com o plugin registrado
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  try {
    const activeSubs = subscriptions.filter(s => !s.status?.startsWith('cancelled'));

    // Calcula total mensal simples (sem conversão de moeda — usa baseCurrency)
    const totalMonthlyCost = activeSubs.reduce((sum, s) => {
      const monthly = s.billingCycle === 'Yearly' ? s.costAmount / 12 : s.costAmount;
      const rate = exchangeRates[s.costCurrency] ?? 1;
      const baseRate = exchangeRates[baseCurrency] ?? 1;
      return sum + (monthly * baseRate / rate);
    }, 0);

    const totalMonthlyIncome = activeSubs.reduce((sum, s) => {
      if (!s.hasIncome) return sum;
      const monthly = s.incomeFrequency === 'Monthly' ? s.incomeAmount : s.incomeAmount / 12;
      const rate = exchangeRates[s.incomeCurrency] ?? 1;
      const baseRate = exchangeRates[baseCurrency] ?? 1;
      return sum + (monthly * baseRate / rate);
    }, 0);

    // Próximo vencimento (dia mais próximo)
    const today = new Date().getDate();
    const upcoming = [...activeSubs]
      .sort((a, b) => {
        const daysA = a.dueDate >= today ? a.dueDate - today : 31 - today + a.dueDate;
        const daysB = b.dueDate >= today ? b.dueDate - today : 31 - today + b.dueDate;
        return daysA - daysB;
      })[0];

    const userPayload: WearUserPayload = {
      isAuthenticated: !!user,
      userId: user?.id ?? '',
      userHandle,
      userName: user?.user_metadata?.full_name ?? '',
      baseCurrency,
      totalMonthlyCost,
      totalMonthlyIncome,
      netMonthlyCost: totalMonthlyCost - totalMonthlyIncome,
      subscriptionCount: activeSubs.length,
      nextDueName: upcoming?.name ?? '',
      nextDueDate: upcoming?.dueDate ?? 0,
      nextDueAmount: upcoming?.costAmount ?? 0,
      nextDueCurrency: upcoming?.costCurrency ?? baseCurrency,
      lastSyncTimestamp: Date.now(),
    };

    // Assinaturas simplificadas para o relógio
    const watchSubs = activeSubs.map(s => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji ?? '📦',
      costAmount: s.costAmount,
      costCurrency: s.costCurrency,
      billingCycle: s.billingCycle,
      dueDate: s.dueDate,
      status: s.status ?? 'active',
      category: s.category,
      hasIncome: !!s.hasIncome,
      incomeAmount: s.incomeAmount ?? 0,
    }));

    await WearBridge.pushToWatch({
      userJson: JSON.stringify(userPayload),
      subsJson: JSON.stringify({ items: watchSubs }),
    });
  } catch (err) {
    // Silencioso — o relógio pode não estar conectado
    console.warn('[WearSync] Push failed:', err);
  }
}
