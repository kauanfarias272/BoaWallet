interface PendingSyncItem {
  subscriptionId: string;
  userId: string;
  queuedAt: number;
  retryCount: number;
  nextRetryAt: number;
}

const QUEUE_KEY = 'boa_pending_sync_queue';

export function getSyncQueue(): PendingSyncItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToSyncQueue(subscriptionId: string, userId: string): void {
  const queue = getSyncQueue().filter(i => i.subscriptionId !== subscriptionId);
  queue.push({
    subscriptionId,
    userId,
    queuedAt: Date.now(),
    retryCount: 0,
    nextRetryAt: Date.now() + 60_000,
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromSyncQueue(subscriptionId: string): void {
  const queue = getSyncQueue().filter(i => i.subscriptionId !== subscriptionId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function markRetried(subscriptionId: string): void {
  const queue = getSyncQueue();
  const item = queue.find(i => i.subscriptionId === subscriptionId);
  if (item) {
    item.retryCount++;
    const delays = [60_000, 300_000, 900_000, 1_800_000];
    item.nextRetryAt = Date.now() + delays[Math.min(item.retryCount, delays.length - 1)];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}

export function getDueItems(): PendingSyncItem[] {
  return getSyncQueue().filter(i => Date.now() >= i.nextRetryAt);
}
