import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string) {
  const safeAmount = Number(amount) || 0;
  if (currency === 'BTC' || currency === 'SATS') {
    return `${currency === 'BTC' ? '₿' : 'SATS'} ${safeAmount.toLocaleString('en-US', { minimumFractionDigits: currency === 'BTC' ? 8 : 0, maximumFractionDigits: currency === 'BTC' ? 8 : 0 })}`;
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(safeAmount);
  } catch (e) {
    return `${currency} ${safeAmount.toFixed(2)}`;
  }
}
