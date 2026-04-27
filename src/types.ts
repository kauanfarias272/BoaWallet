export type Currency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'TRY' | 'ARS' | 'INR' | 'IDR' | 'CAD' | 'AUD' | 'CHF' | 'CNY' | 'MXN' | 'BTC' | 'SATS';

export type PaymentMethod = 'Cartão de Crédito' | 'Cartão de Débito' | 'Gift Card' | 'Pix' | 'Transferência' | 'Bitcoin' | 'Outro';
export type PaymentSource = 'Revolut' | 'N26' | 'Nubank' | 'Wise' | 'Inter' | 'Intesa Sanpaolo' | 'Bitrefill' | 'Outro';

export type BillingCycle = 'Monthly' | 'Yearly';
export type SharePaymentMode = 'immediate' | 'bitcoin';
export type SharePaymentType = 'onetime' | 'monthly';
export type SharePaymentStatus = 'unpaid' | 'paid' | 'active' | 'overdue' | 'disputed' | 'cancelled';
export type CredentialsReleaseMode = 'after_accept' | 'after_payment';

export interface SubItem {
  id: string;
  name: string;
  costAmount: number;
}

export interface Adjustment {
  id: string;
  description: string;
  subscriptionId?: string;
  amount: number;
  currency: Currency;
  month: number;
  year: number;
}

export type SubscriptionType = 'Subscription' | 'FixedExpense';

export interface SharedMember {
  id: string;
  name: string;
  userId?: string;
  username?: string;
  accepted?: boolean;
  shareCredentials?: boolean;
  shareType?: 'amount' | 'percentage';
  percentage?: number;
  amount: number;
  currency: Currency;
  info?: string;
  paymentDate?: number;
  paidCurrentMonth?: boolean;
  lastPaidPeriod?: string;
  paymentMode?: SharePaymentMode;
  paymentType?: SharePaymentType;
  paymentStatus?: SharePaymentStatus;
  bitcoinAmountSats?: number;
  platformFeeSats?: number;
  guaranteeSats?: number;
  credentialsUnlocked?: boolean;
  lastPaidAt?: string;
  nextPaymentDueAt?: string;
  pendingReleaseUntil?: string;
  latestPaymentEventId?: string;
  publicJoin?: boolean;
}

export interface Subscription {
  id: string;
  name: string;
  type?: SubscriptionType;
  emoji: string;
  logoUrl?: string; // Optional app logo URL
  category: string;
  notes?: string; // User notes
  isPublic?: boolean;
  allowPublicParticipants?: boolean;
  publicSharePriceSats?: number;
  publicPaymentType?: SharePaymentType;
  publicCredentialsEnabled?: boolean;
  
  costAmount: number;
  costCurrency: Currency;
  billingCycle: BillingCycle;
  dueDate: number; // 1-31
  dueMonth?: number; // 1-12 (for yearly subscriptions)
  
  isPromotional?: boolean;
  originalCost?: number;
  promoEndDate?: string; // ISO date string or empty for "never expires"
  
  hasEarlyPayDiscount?: boolean;
  earlyPayDate?: number; // 1-31
  earlyPayCost?: number;
  
  fiatReferenceAmount?: number;
  fiatReferenceCurrency?: Currency;
  createdAt?: string | number;
  updatedAt?: string | number;
  
  subItems: SubItem[];
  
  paymentMethod: PaymentMethod;
  paymentSource: string;
  bankLogoUrl?: string; // Optional bank logo URL
  serviceUsername?: string;
  servicePassword?: string;
  
  hasCashback: boolean;
  cashbackPercentage: number;
  
  hasIncome: boolean;
  incomeAmount: number;
  incomeCurrency: Currency;
  incomeFrequency: BillingCycle;
  incomeSourceDescription: string;
  
  isSingleExpense?: boolean;
  isFlexibleDate?: boolean;
  sharedWith?: SharedMember[];
  isSharedIncoming?: boolean;
  sharedOwnerId?: string;
  sharedOwnerName?: string;
  sharedOwnerUsername?: string;
  sourceSubscriptionId?: string;
  sourceShareId?: string;

  status?: 'active' | 'cancelled_temporary' | 'cancelled_permanent';
  paymentHistory?: Record<string, 'paid' | 'skipped' | 'auto-paid'>;
  autoRenewDate?: number; // Day of month to auto-reactivate (for temp pauses)
  reminderDisabled?: boolean; // Disable 10-day reminders for temp pauses
  syncStatus?: 'synced' | 'pending' | 'failed'; // Client-side only — not stored in Supabase
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
  // If early pay discount is active and has a value, use it as the base cost
  const baseCost = (sub.hasEarlyPayDiscount && sub.earlyPayCost && sub.earlyPayCost > 0)
    ? sub.earlyPayCost
    : (sub.costAmount || 0);
  return baseCost + subItemsTotal;
};

export const getEffectiveTotalCost = (sub: Subscription): { amount: number, currency: Currency } => {
  if (sub.costCurrency === 'BTC' || sub.costCurrency === 'SATS') {
    return { 
      amount: sub.fiatReferenceAmount || 0, 
      currency: sub.fiatReferenceCurrency || 'USD' 
    };
  }
  return { 
    amount: getSubscriptionTotalCost(sub), 
    currency: sub.costCurrency 
  };
};
