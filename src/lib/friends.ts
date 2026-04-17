export interface FriendshipRow {
  id: string;
  user_one: string;
  user_two: string;
  created_by: string;
  created_at: string;
}

export interface FriendProfile {
  id: string;
  name?: string;
  username?: string;
  createdAt?: string;
}

const FRIENDS_CACHE_PREFIX = 'boa_friends_cache_v1:';
const MAX_CACHED_FRIENDS = 250;

const normalizeFriendProfile = (profile: Partial<FriendProfile> | null | undefined): FriendProfile | null => {
  if (!profile?.id) return null;

  return {
    id: String(profile.id),
    name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : undefined,
    username: typeof profile.username === 'string' && profile.username.trim()
      ? profile.username.replace('@', '').trim().toLowerCase()
      : undefined,
    createdAt: typeof profile.createdAt === 'string' && profile.createdAt ? profile.createdAt : undefined,
  };
};

export function sortFriendPair(firstUserId: string, secondUserId: string): [string, string] {
  return firstUserId < secondUserId
    ? [firstUserId, secondUserId]
    : [secondUserId, firstUserId];
}

export function getFriendId(row: FriendshipRow, currentUserId: string): string {
  return row.user_one === currentUserId ? row.user_two : row.user_one;
}

export function readFriendsCache(currentUserId: string): FriendProfile[] {
  if (!currentUserId || typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(FRIENDS_CACHE_PREFIX + currentUserId);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeFriendProfile)
      .filter(Boolean) as FriendProfile[];
  } catch {
    return [];
  }
}

export function writeFriendsCache(currentUserId: string, friends: FriendProfile[]) {
  if (!currentUserId || typeof localStorage === 'undefined') return;

  try {
    const uniqueFriends = new Map<string, FriendProfile>();
    for (const friend of friends) {
      const normalized = normalizeFriendProfile(friend);
      if (!normalized) continue;
      uniqueFriends.set(normalized.id, normalized);
    }

    localStorage.setItem(
      FRIENDS_CACHE_PREFIX + currentUserId,
      JSON.stringify(Array.from(uniqueFriends.values()).slice(0, MAX_CACHED_FRIENDS))
    );
  } catch {
    // ignore cache write failures
  }
}
