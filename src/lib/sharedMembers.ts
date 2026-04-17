import { SharedMember } from '../types';

export function getCurrentSharedPeriodKey(date: Date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export function isSharedMemberPaid(member: SharedMember, date: Date = new Date()): boolean {
  const currentPeriod = getCurrentSharedPeriodKey(date);
  if (member.lastPaidPeriod) return member.lastPaidPeriod === currentPeriod;
  return !!member.paidCurrentMonth;
}

export function withSharedMemberPaymentStatus(
  member: SharedMember,
  paid: boolean,
  date: Date = new Date()
): SharedMember {
  const currentPeriod = getCurrentSharedPeriodKey(date);
  return {
    ...member,
    paidCurrentMonth: paid,
    lastPaidPeriod: paid ? currentPeriod : undefined,
  };
}

export function normalizeSharedMember(member: Partial<SharedMember>, defaultCurrency: SharedMember['currency']): SharedMember {
  const lastPaidPeriod = member.lastPaidPeriod || (member.paidCurrentMonth ? getCurrentSharedPeriodKey() : undefined);
  const shareType = member.shareType === 'percentage' ? 'percentage' : 'amount';
  const percentage = Number(member.percentage) || 0;
  const paymentType = member.paymentType === 'monthly' ? 'monthly' : 'onetime';
  const paymentMode = member.paymentMode === 'bitcoin' ? 'bitcoin' : 'immediate';
  return {
    id: String(member.id || Date.now() + Math.random()),
    name: member.name || '',
    userId: member.userId ? String(member.userId) : undefined,
    username: member.username ? String(member.username).replace('@', '').toLowerCase() : undefined,
    accepted: typeof member.accepted === 'boolean' ? member.accepted : undefined,
    shareCredentials: !!member.shareCredentials,
    shareType,
    percentage: shareType === 'percentage' ? percentage : 0,
    amount: Number(member.amount) || 0,
    currency: member.currency || defaultCurrency,
    info: member.info || '',
    paymentDate: Number(member.paymentDate) || 1,
    paidCurrentMonth: lastPaidPeriod ? lastPaidPeriod === getCurrentSharedPeriodKey() : !!member.paidCurrentMonth,
    lastPaidPeriod,
    paymentMode,
    paymentType,
    paymentStatus: member.paymentStatus || 'unpaid',
    bitcoinAmountSats: Number(member.bitcoinAmountSats) || 0,
    platformFeeSats: Number(member.platformFeeSats) || 0,
    guaranteeSats: Number(member.guaranteeSats) || 0,
    credentialsUnlocked: !!member.credentialsUnlocked,
    lastPaidAt: member.lastPaidAt || undefined,
    nextPaymentDueAt: member.nextPaymentDueAt || undefined,
    pendingReleaseUntil: member.pendingReleaseUntil || undefined,
    latestPaymentEventId: member.latestPaymentEventId || undefined,
    publicJoin: !!member.publicJoin,
  };
}

export function findSharedMemberForUser(
  members: Partial<SharedMember>[] | undefined,
  userId: string,
  username?: string
): SharedMember | undefined {
  const normalizedUsername = username?.replace('@', '').trim().toLowerCase();

  return (members || []).find((member) => {
    const normalizedMemberUserId = member.userId ? String(member.userId) : undefined;
    const normalizedMemberId = member.id ? String(member.id) : undefined;
    const normalizedMemberUsername = member.username?.replace('@', '').trim().toLowerCase();

    return (
      normalizedMemberUserId === userId ||
      normalizedMemberId === userId ||
      (!!normalizedUsername && normalizedMemberUsername === normalizedUsername)
    );
  }) as SharedMember | undefined;
}

export function resolveSharedMemberAmount(member: Partial<SharedMember>, subscriptionAmount: number): number {
  if (member.shareType === 'percentage') {
    const percentage = Number(member.percentage) || 0;
    return Number(((subscriptionAmount || 0) * percentage) / 100);
  }

  return Number(member.amount) || 0;
}
