import { supabase } from '../supabase';
import { SharePaymentType } from '../types';

const INITIAL_PLATFORM_FEE_RATE = 0.5;
const RECURRING_PLATFORM_FEE_RATE = 0.02;
const USER_TRANSFER_FEE_RATE = 0.01;
const EXTERNAL_INVOICE_PLATFORM_FEE_RATE = 0.02;
const ESCROW_HOLD_MINUTES = 30;

export interface WalletSnapshot {
  balanceSats: number;
  reservedSats: number;
  availableSats: number;
}

export interface PlatformJoinPreview {
  sellerAmountSats: number;
  platformFeeSats: number;
  totalChargeSats: number;
  guaranteeSats: number;
  requiredAvailableSats: number;
  recurringChargeSats: number;
}

type SubscriptionMemberPaymentRow = {
  id: string;
  subscription_id: string;
  owner_id: string;
  member_id: string;
  payment_type?: SharePaymentType;
  payment_status?: string;
  bitcoin_amount_sats?: number;
  guarantee_sats?: number;
  next_payment_due_at?: string | null;
  pending_release_until?: string | null;
};

const toSafeInt = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const normalizeUsername = (username: string) => username.replace('@', '').trim().toLowerCase();

export function computeInitialPlatformFee(amountSats: number) {
  return Math.ceil(toSafeInt(amountSats) * INITIAL_PLATFORM_FEE_RATE);
}

export function computeRecurringPlatformFee(amountSats: number) {
  return Math.ceil(toSafeInt(amountSats) * RECURRING_PLATFORM_FEE_RATE);
}

export function computeUserTransferFee(amountSats: number) {
  return Math.ceil(toSafeInt(amountSats) * USER_TRANSFER_FEE_RATE);
}

export function computeExternalInvoiceFee(amountSats: number) {
  return Math.ceil(toSafeInt(amountSats) * EXTERNAL_INVOICE_PLATFORM_FEE_RATE);
}

export function getPlatformJoinPreview(amountSats: number, paymentType: SharePaymentType): PlatformJoinPreview {
  const sellerAmountSats = toSafeInt(amountSats);
  const platformFeeSats = computeInitialPlatformFee(sellerAmountSats);
  const totalChargeSats = sellerAmountSats + platformFeeSats;
  const guaranteeSats = paymentType === 'monthly' ? sellerAmountSats : 0;
  const requiredAvailableSats = totalChargeSats + guaranteeSats;
  const recurringChargeSats = sellerAmountSats + computeRecurringPlatformFee(sellerAmountSats);

  return {
    sellerAmountSats,
    platformFeeSats,
    totalChargeSats,
    guaranteeSats,
    requiredAvailableSats,
    recurringChargeSats,
  };
}

export async function getReservedGuaranteeSats(userId: string) {
  const { data, error } = await supabase
    .from('subscription_members')
    .select('guarantee_sats')
    .eq('member_id', userId)
    .eq('payment_type', 'monthly')
    .in('payment_status', ['active', 'paid', 'overdue']);

  // Column may not exist yet in older DB schemas — treat as 0 gracefully
  if (error) {
    if (error.code === '42703' || error.message?.toLowerCase().includes('guarantee_sats')) return 0;
    throw error;
  }

  return (((data as { guarantee_sats?: number }[] | null) || []).reduce(
    (total, row) => total + toSafeInt(row.guarantee_sats),
    0
  ));
}

export async function getWalletSnapshot(userId: string): Promise<WalletSnapshot> {
  const [{ data: balanceRow, error: balanceError }, reservedSats] = await Promise.all([
    supabase
      .from('lightning_balances')
      .select('balance_sats')
      .eq('user_id', userId)
      .maybeSingle(),
    getReservedGuaranteeSats(userId),
  ]);

  if (balanceError) throw balanceError;

  const balanceSats = toSafeInt((balanceRow as { balance_sats?: number } | null)?.balance_sats);
  const reserved = Math.min(balanceSats, reservedSats);

  return {
    balanceSats,
    reservedSats: reserved,
    availableSats: Math.max(0, balanceSats - reserved),
  };
}

async function insertPaymentEvent(params: {
  memberRowId: string;
  subscriptionId: string;
  payerId: string;
  ownerId: string;
  sellerAmountSats: number;
  platformFeeSats: number;
  paymentType: SharePaymentType;
  eventKind: 'initial' | 'recurring';
}) {
  const releaseAt = addMinutes(new Date(), ESCROW_HOLD_MINUTES).toISOString();
  const { data, error } = await supabase
    .from('subscription_payment_events')
    .insert({
      member_row_id: params.memberRowId,
      subscription_id: params.subscriptionId,
      payer_id: params.payerId,
      owner_id: params.ownerId,
      seller_amount_sats: params.sellerAmountSats,
      platform_fee_sats: params.platformFeeSats,
      payment_type: params.paymentType,
      event_kind: params.eventKind,
      status: 'pending_release',
      release_at: releaseAt,
    })
    .select('id,release_at')
    .single();

  if (error) throw error;

  return {
    id: String((data as { id: string }).id),
    releaseAt: String((data as { release_at: string }).release_at || releaseAt),
  };
}

export async function releaseDueSubscriptionEscrows() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('subscription_payment_events')
    .select('id,owner_id,seller_amount_sats')
    .eq('status', 'pending_release')
    .lte('release_at', nowIso);

  if (error) throw error;

  const events = (data as { id: string; owner_id: string; seller_amount_sats?: number }[] | null) || [];

  for (const event of events) {
    await supabase.rpc('upsert_lightning_balance', {
      p_user_id: event.owner_id,
      p_delta: toSafeInt(event.seller_amount_sats),
    });

    await supabase
      .from('subscription_payment_events')
      .update({
        status: 'released',
        released_at: nowIso,
      })
      .eq('id', event.id);
  }

  return events.length;
}

export async function chargeSharedMembership(params: {
  memberRowId: string;
  subscriptionId: string;
  payerId: string;
  ownerId: string;
  amountSats: number;
  paymentType: SharePaymentType;
  releaseCredentials: boolean;
}) {
  const preview = getPlatformJoinPreview(params.amountSats, params.paymentType);
  const snapshot = await getWalletSnapshot(params.payerId);

  if (snapshot.availableSats < preview.requiredAvailableSats) {
    throw new Error('Saldo insuficiente para pagar e manter a garantia exigida.');
  }

  const event = await insertPaymentEvent({
    memberRowId: params.memberRowId,
    subscriptionId: params.subscriptionId,
    payerId: params.payerId,
    ownerId: params.ownerId,
    sellerAmountSats: preview.sellerAmountSats,
    platformFeeSats: preview.platformFeeSats,
    paymentType: params.paymentType,
    eventKind: 'initial',
  });

  await supabase.rpc('upsert_lightning_balance', {
    p_user_id: params.payerId,
    p_delta: -preview.totalChargeSats,
  });

  const nowIso = new Date().toISOString();
  const nextPaymentDueAt = params.paymentType === 'monthly'
    ? addMonths(new Date(), 1).toISOString()
    : null;

  const { error } = await supabase
    .from('subscription_members')
    .update({
      accepted: true,
      payment_mode: 'bitcoin',
      payment_type: params.paymentType,
      payment_status: params.paymentType === 'monthly' ? 'active' : 'paid',
      bitcoin_amount_sats: preview.sellerAmountSats,
      platform_fee_sats: preview.platformFeeSats,
      credentials_unlocked: params.releaseCredentials,
      last_paid_at: nowIso,
      next_payment_due_at: nextPaymentDueAt,
      pending_release_until: event.releaseAt,
      latest_payment_event_id: event.id,
    })
    .eq('id', params.memberRowId)
    .eq('member_id', params.payerId);

  if (error) throw error;

  return {
    preview,
    releaseAt: event.releaseAt,
  };
}

export async function disputeLatestSharedMembershipPayment(params: {
  memberRowId: string;
  payerId: string;
}) {
  const { data: event, error: eventError } = await supabase
    .from('subscription_payment_events')
    .select('id,seller_amount_sats,platform_fee_sats,status')
    .eq('member_row_id', params.memberRowId)
    .eq('payer_id', params.payerId)
    .eq('status', 'pending_release')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) throw new Error('Nao ha pagamento em retencao para contestar.');

  const refundSats = toSafeInt((event as { seller_amount_sats?: number }).seller_amount_sats)
    + toSafeInt((event as { platform_fee_sats?: number }).platform_fee_sats);

  await supabase.rpc('upsert_lightning_balance', {
    p_user_id: params.payerId,
    p_delta: refundSats,
  });

  const nowIso = new Date().toISOString();

  await supabase
    .from('subscription_payment_events')
    .update({
      status: 'refunded',
      refunded_at: nowIso,
    })
    .eq('id', (event as { id: string }).id);

  const { error } = await supabase
    .from('subscription_members')
    .update({
      accepted: false,
      payment_status: 'disputed',
      credentials_unlocked: false,
      pending_release_until: null,
      next_payment_due_at: null,
    })
    .eq('id', params.memberRowId)
    .eq('member_id', params.payerId);

  if (error) throw error;

  return refundSats;
}

export async function processRecurringMemberships(userId: string) {
  const now = new Date();
  const nowIso = now.toISOString();

  const { data, error } = await supabase
    .from('subscription_members')
    .select('id,subscription_id,owner_id,member_id,payment_type,payment_status,bitcoin_amount_sats,next_payment_due_at')
    .eq('member_id', userId)
    .eq('payment_type', 'monthly')
    .in('payment_status', ['active', 'paid', 'overdue'])
    .lte('next_payment_due_at', nowIso);

  if (error) throw error;

  const dueRows = (data as SubscriptionMemberPaymentRow[] | null) || [];
  let processed = 0;

  for (const row of dueRows) {
    const amountSats = toSafeInt(row.bitcoin_amount_sats);
    const platformFeeSats = computeRecurringPlatformFee(amountSats);
    const totalChargeSats = amountSats + platformFeeSats;
    const snapshot = await getWalletSnapshot(userId);

    if (snapshot.availableSats < totalChargeSats) {
      await supabase
        .from('subscription_members')
        .update({ payment_status: 'overdue' })
        .eq('id', row.id)
        .eq('member_id', userId);
      continue;
    }

    const event = await insertPaymentEvent({
      memberRowId: row.id,
      subscriptionId: row.subscription_id,
      payerId: userId,
      ownerId: row.owner_id,
      sellerAmountSats: amountSats,
      platformFeeSats,
      paymentType: 'monthly',
      eventKind: 'recurring',
    });

    await supabase.rpc('upsert_lightning_balance', {
      p_user_id: userId,
      p_delta: -totalChargeSats,
    });

    await supabase
      .from('subscription_members')
      .update({
        payment_status: 'active',
        platform_fee_sats: platformFeeSats,
        last_paid_at: nowIso,
        next_payment_due_at: addMonths(now, 1).toISOString(),
        pending_release_until: event.releaseAt,
        latest_payment_event_id: event.id,
      })
      .eq('id', row.id)
      .eq('member_id', userId);

    processed += 1;
  }

  return processed;
}

export async function claimPendingTransfers(userId: string, userHandle?: string) {
  const normalizedHandle = userHandle ? normalizeUsername(userHandle) : '';
  if (!normalizedHandle) return 0;

  const { data, error } = await supabase
    .from('lightning_pending_transfers')
    .select('id,amount_sats')
    .eq('recipient_username', normalizedHandle)
    .eq('status', 'pending');

  if (error) throw error;

  const transfers = (data as { id: string; amount_sats?: number }[] | null) || [];
  if (transfers.length === 0) return 0;

  const creditTotal = transfers.reduce((total, transfer) => total + toSafeInt(transfer.amount_sats), 0);

  await supabase.rpc('upsert_lightning_balance', {
    p_user_id: userId,
    p_delta: creditTotal,
  });

  await supabase
    .from('lightning_pending_transfers')
    .update({
      status: 'claimed',
      recipient_user_id: userId,
      claimed_at: new Date().toISOString(),
    })
    .eq('recipient_username', normalizedHandle)
    .eq('status', 'pending');

  return transfers.length;
}

export async function sendBalanceByUsername(params: {
  senderId: string;
  recipientUsername: string;
  amountSats: number;
}) {
  const recipientUsername = normalizeUsername(params.recipientUsername);
  const amountSats = toSafeInt(params.amountSats);

  if (!recipientUsername) throw new Error('Informe um @username valido.');
  if (amountSats <= 0) throw new Error('Informe um valor valido em sats.');

  const feeSats = computeUserTransferFee(amountSats);
  const totalDebitSats = amountSats + feeSats;
  const snapshot = await getWalletSnapshot(params.senderId);

  if (snapshot.availableSats < totalDebitSats) {
    throw new Error('Saldo disponivel insuficiente para a transferencia.');
  }

  const { data: recipient, error: recipientError } = await supabase
    .from('users')
    .select('id,username')
    .eq('username', recipientUsername)
    .maybeSingle();

  if (recipientError) throw recipientError;

  await supabase.rpc('upsert_lightning_balance', {
    p_user_id: params.senderId,
    p_delta: -totalDebitSats,
  });

  if ((recipient as { id?: string } | null)?.id) {
    await supabase.rpc('upsert_lightning_balance', {
      p_user_id: (recipient as { id: string }).id,
      p_delta: amountSats,
    });
  } else {
    const { error } = await supabase
      .from('lightning_pending_transfers')
      .insert({
        sender_id: params.senderId,
        recipient_username: recipientUsername,
        amount_sats: amountSats,
        fee_sats: feeSats,
        status: 'pending',
      });

    if (error) throw error;
  }

  return {
    feeSats,
    totalDebitSats,
    deliveredInstantly: !!(recipient as { id?: string } | null)?.id,
  };
}
