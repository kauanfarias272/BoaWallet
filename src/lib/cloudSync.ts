/**
 * Cloud sync helper.
 *
 * Primary store: Firebase Firestore at /users/{uid}/subscriptions and
 * /users/{uid}/adjustments (rules are permissive for the owner).
 *
 * Secondary store: Supabase (best-effort mirror). The schema of the
 * hosted Supabase project may not include every optional column, so
 * the write is wrapped in try/catch and never blocks the save.
 *
 * The Supabase payload uses two strategies:
 *   1. Full row with all fields (fails if columns don't exist).
 *   2. Minimal row { id, user_id, data: <full object as jsonb> }.
 * We try (1) first; on any failure we fall back to (2). The user only
 * needs either schema to be present for the mirror to work.
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { supabase } from '../supabase';
import { Subscription, Adjustment } from '../types';

const log = (...a: any[]) => console.log('[BoaWallet sync]', ...a);
const warn = (...a: any[]) => console.warn('[BoaWallet sync]', ...a);

// ---------------------------------------------------------------------------
// Firebase (primary)
// ---------------------------------------------------------------------------

async function firebaseWriteSubscription(uid: string, sub: Subscription) {
  const ref = doc(db, 'users', uid, 'subscriptions', sub.id);
  await setDoc(ref, { ...sub, user_id: uid }, { merge: true });
}

async function firebaseDeleteSubscription(uid: string, id: string) {
  await deleteDoc(doc(db, 'users', uid, 'subscriptions', id));
  // Also try legacy flat collection, ignore errors.
  try { await deleteDoc(doc(db, 'subscriptions', id)); } catch {}
}

async function firebaseReadAllSubscriptions(uid: string): Promise<Subscription[]> {
  const out: Subscription[] = [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'subscriptions'));
    snap.forEach(d => out.push({ ...(d.data() as any), id: d.id }));
  } catch (e) { warn('firebaseReadAllSubscriptions failed', e); }
  return out;
}

async function firebaseWriteAdjustment(uid: string, adj: Adjustment) {
  const ref = doc(db, 'users', uid, 'adjustments', adj.id);
  await setDoc(ref, { ...adj, user_id: uid }, { merge: true });
}

async function firebaseDeleteAdjustment(uid: string, id: string) {
  await deleteDoc(doc(db, 'users', uid, 'adjustments', id));
}

async function firebaseReadAllAdjustments(uid: string): Promise<Adjustment[]> {
  const out: Adjustment[] = [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'adjustments'));
    snap.forEach(d => out.push({ ...(d.data() as any), id: d.id }));
  } catch (e) { warn('firebaseReadAllAdjustments failed', e); }
  return out;
}

// ---------------------------------------------------------------------------
// Supabase (best-effort mirror)
// ---------------------------------------------------------------------------

function isMissingColumnError(err: any): boolean {
  const msg = (err?.message || err?.error_description || '').toLowerCase();
  return (
    msg.includes('could not find') ||
    msg.includes('column') ||
    msg.includes('schema cache') ||
    err?.code === 'PGRST204' ||
    err?.code === 'PGRST200' ||
    err?.code === '42703' // undefined_column
  );
}

async function supabaseSafeUpsertSubscription(uid: string, sub: Subscription) {
  const full = { ...sub, user_id: uid };
  try {
    const { error } = await supabase.from('subscriptions').upsert(full);
    if (!error) return;
    if (!isMissingColumnError(error)) { warn('Supabase sub upsert error:', error); return; }
  } catch (e) { /* fall through to minimal */ }

  // Fallback: minimal row with a jsonb `data` column.
  try {
    const minimal = { id: sub.id, user_id: uid, data: sub };
    const { error: e2 } = await supabase.from('subscriptions').upsert(minimal);
    if (e2) warn('Supabase minimal sub upsert failed:', e2);
  } catch (e) { warn('Supabase minimal sub upsert threw:', e); }
}

async function supabaseSafeDeleteSubscription(uid: string, id: string) {
  try {
    await supabase.from('subscriptions').delete().eq('id', id).eq('user_id', uid);
  } catch (e) { warn('Supabase sub delete failed:', e); }
}

async function supabaseSafeUpsertAdjustment(uid: string, adj: Adjustment) {
  const full = { ...adj, user_id: uid };
  try {
    const { error } = await supabase.from('adjustments').upsert(full);
    if (!error) return;
    if (!isMissingColumnError(error)) { warn('Supabase adj upsert error:', error); return; }
  } catch (e) { /* fall through */ }
  try {
    const minimal = { id: adj.id, user_id: uid, data: adj };
    const { error: e2 } = await supabase.from('adjustments').upsert(minimal);
    if (e2) warn('Supabase minimal adj upsert failed:', e2);
  } catch (e) { warn('Supabase minimal adj upsert threw:', e); }
}

async function supabaseSafeDeleteAdjustment(uid: string, id: string) {
  try {
    await supabase.from('adjustments').delete().eq('id', id).eq('user_id', uid);
  } catch (e) { warn('Supabase adj delete failed:', e); }
}

function normalizeSupabaseRow(row: any): any {
  // If the row was stored via the "data jsonb" fallback, unwrap it.
  if (row && row.data && typeof row.data === 'object' && row.id) {
    return { ...row.data, id: row.id };
  }
  return row;
}

async function supabaseReadAllSubscriptions(uid: string): Promise<Subscription[]> {
  try {
    const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', uid);
    if (error) { warn('Supabase sub read error:', error); return []; }
    return (data || []).map(normalizeSupabaseRow) as Subscription[];
  } catch (e) { warn('Supabase sub read threw:', e); return []; }
}

async function supabaseReadAllAdjustments(uid: string): Promise<Adjustment[]> {
  try {
    const { data, error } = await supabase.from('adjustments').select('*').eq('user_id', uid);
    if (error) { warn('Supabase adj read error:', error); return []; }
    return (data || []).map(normalizeSupabaseRow) as Adjustment[];
  } catch (e) { warn('Supabase adj read threw:', e); return []; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function saveSubscription(uid: string, sub: Subscription) {
  // Run in parallel; Firebase is authoritative, Supabase is best-effort.
  const results = await Promise.allSettled([
    firebaseWriteSubscription(uid, sub),
    supabaseSafeUpsertSubscription(uid, sub),
  ]);
  const firebase = results[0];
  if (firebase.status === 'rejected') {
    warn('Firebase save failed:', firebase.reason);
    throw firebase.reason; // Only throw if primary failed.
  }
  log('saved', sub.id);
}

export async function deleteSubscription(uid: string, id: string) {
  await Promise.allSettled([
    firebaseDeleteSubscription(uid, id),
    supabaseSafeDeleteSubscription(uid, id),
  ]);
  log('deleted', id);
}

export async function saveAdjustment(uid: string, adj: Adjustment) {
  const results = await Promise.allSettled([
    firebaseWriteAdjustment(uid, adj),
    supabaseSafeUpsertAdjustment(uid, adj),
  ]);
  if (results[0].status === 'rejected') {
    warn('Firebase adjustment save failed:', results[0].reason);
    throw results[0].reason;
  }
}

export async function deleteAdjustment(uid: string, id: string) {
  await Promise.allSettled([
    firebaseDeleteAdjustment(uid, id),
    supabaseSafeDeleteAdjustment(uid, id),
  ]);
}

export interface PulledData {
  subscriptions: Subscription[];
  adjustments: Adjustment[];
}

/**
 * Pull everything from the cloud (both sources) and merge by ID.
 * Firebase wins on conflict because it is the primary store.
 */
export async function pullAll(uid: string): Promise<PulledData> {
  const [fbSubs, spSubs, fbAdjs, spAdjs] = await Promise.all([
    firebaseReadAllSubscriptions(uid),
    supabaseReadAllSubscriptions(uid),
    firebaseReadAllAdjustments(uid),
    supabaseReadAllAdjustments(uid),
  ]);

  const subMap = new Map<string, Subscription>();
  spSubs.forEach(s => s && s.id && subMap.set(s.id, s));
  fbSubs.forEach(s => s && s.id && subMap.set(s.id, s)); // Firebase wins

  const adjMap = new Map<string, Adjustment>();
  spAdjs.forEach(a => a && a.id && adjMap.set(a.id, a));
  fbAdjs.forEach(a => a && a.id && adjMap.set(a.id, a));

  return {
    subscriptions: Array.from(subMap.values()),
    adjustments: Array.from(adjMap.values()),
  };
}

/**
 * Push a full snapshot to the cloud. Used by import + manual sync.
 * Errors are logged, never thrown, so partial sync still succeeds.
 */
export async function pushAll(
  uid: string,
  subs: Subscription[],
  adjs: Adjustment[] = []
) {
  const ops: Promise<any>[] = [];
  for (const s of subs) {
    ops.push(firebaseWriteSubscription(uid, s).catch(e => warn('fb sub', s.id, e)));
    ops.push(supabaseSafeUpsertSubscription(uid, s));
  }
  for (const a of adjs) {
    ops.push(firebaseWriteAdjustment(uid, a).catch(e => warn('fb adj', a.id, e)));
    ops.push(supabaseSafeUpsertAdjustment(uid, a));
  }
  await Promise.allSettled(ops);
  log(`pushed ${subs.length} subs + ${adjs.length} adjs`);
}

/**
 * Migrate legacy flat-collection subscriptions (old structure) into the
 * new nested path. Only reads — writes happen via saveSubscription.
 */
export async function migrateLegacyFlatSubscriptions(uid: string): Promise<Subscription[]> {
  try {
    const { query, where } = await import('firebase/firestore');
    const q = query(collection(db, 'subscriptions'), where('user_id', '==', uid));
    const snap = await getDocs(q);
    const out: Subscription[] = [];
    snap.forEach(d => out.push({ ...(d.data() as any), id: d.id }));
    return out;
  } catch (e) { warn('legacy migration read failed', e); return []; }
}
