export type Currency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'TRY' | 'ARS' | 'INR' | 'IDR' | 'CAD' | 'AUD' | 'CHF' | 'CNY' | 'MXN' | 'BTC' | 'SATS';

export type PaymentMethod = 'Cartão de Crédito' | 'Cartão de Débito' | 'Gift Card' | 'Pix' | 'Transferência' | 'Outro';
export type PaymentSource = 'Revolut' | 'N26' | 'Nubank' | 'Wise' | 'Inter' | 'Intesa Sanpaolo' | 'Outro';

export type BillingCycle = 'Monthly' | 'Yearly';

export interface SubItem {
  id: string;
  name: string;
  costAmount: number;
}

export type SubscriptionType = 'Subscription' | 'FixedExpense';

export interface Subscription {
  id: string;
  name: string;
  type?: SubscriptionType;
  emoji: string;
  logoUrl?: string; // Optional app logo URL
  category: string;
  
  costAmount: number;
  costCurrency: Currency;
  billingCycle: BillingCycle;
  dueDate: number; // 1-31
  
  subItems: SubItem[];
  
  paymentMethod: PaymentMethod;
  paymentSource: string;
  bankLogoUrl?: string; // Optional bank logo URL
  
  hasCashback: boolean;
  cashbackPercentage: number;
  
  hasIncome: boolean;
  incomeAmount: number;
  incomeCurrency: Currency;
  incomeFrequency: BillingCycle;
  incomeSourceDescription: string;
}

// Default fallback rates
export const DEFAULT_EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1,
  BRL: 5.05,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 151.2,
  TRY: 32.0,
  ARS: 860.0,
  INR: 83.0,
  IDR: 15800.0,
  CAD: 1.35,
  AUD: 1.52,
  CHF: 0.90,
  CNY: 7.23,
  MXN: 16.50,
  BTC: 0.000015, // Fallback
  SATS: 1500,
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  BRL: 'R$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  TRY: '₺',
  ARS: '$',
  INR: '₹',
  IDR: 'Rp',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  CNY: '¥',
  MXN: '$',
  BTC: '₿',
  SATS: '₿',
};

export const convertCurrency = (amount: number, from: Currency, to: Currency, rates: Record<Currency, number> = DEFAULT_EXCHANGE_RATES): number => {
  if (from === to) return amount;
  const amountInUSD = amount / rates[from];
  return amountInUSD * rates[to];
};

export const getMonthlyAmount = (amount: number, cycle: BillingCycle): number => {
  return cycle === 'Yearly' ? amount / 12 : amount;
};

export const getYearlyAmount = (amount: number, cycle: BillingCycle): number => {
  return cycle === 'Monthly' ? amount * 12 : amount;
};

export const getDailyAmount = (amount: number, cycle: BillingCycle): number => {
  return cycle === 'Monthly' ? amount / 30 : amount / 365;
};

export const getSubscriptionTotalCost = (sub: Subscription): number => {
  const subItemsTotal = sub.subItems?.reduce((acc, item) => acc + (item.costAmount || 0), 0) || 0;
  return (sub.costAmount || 0) + subItemsTotal;
};
