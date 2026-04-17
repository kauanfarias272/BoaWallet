import { supabase } from '../supabase';
import { withTimeout } from './requestTimeout';

export interface FoundBoaUser {
  id: string;
  name?: string;
  username: string;
}

type CachedBoaUser = FoundBoaUser & {
  cachedAt: number;
};

const USER_CACHE_KEY = 'boa_user_directory_cache_v2';
const MAX_CACHE_USERS = 300;

const normalizeFoundUser = (user: Partial<FoundBoaUser> | null | undefined): FoundBoaUser | null => {
  if (!user?.id || !user?.username) return null;

  const username = String(user.username).replace('@', '').trim().toLowerCase();
  if (!username) return null;

  const normalizedName = typeof user.name === 'string' ? user.name.trim() : '';

  return {
    id: String(user.id),
    name: normalizedName || undefined,
    username,
  };
};

const readUserCache = (): CachedBoaUser[] => {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        const normalized = normalizeFoundUser(item);
        if (!normalized) return null;

        return {
          ...normalized,
          cachedAt: Number(item?.cachedAt) || Date.now(),
        };
      })
      .filter(Boolean) as CachedBoaUser[];
  } catch {
    return [];
  }
};

const writeUserCache = (users: CachedBoaUser[]) => {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(users.slice(0, MAX_CACHE_USERS)));
  } catch {
    // ignore cache write failures
  }
};

const mergeUsers = (...lists: Array<Array<Partial<FoundBoaUser>> | null | undefined>): CachedBoaUser[] => {
  const merged = new Map<string, CachedBoaUser>();

  for (const list of lists) {
    for (const user of list || []) {
      const normalized = normalizeFoundUser(user);
      if (!normalized) continue;

      const existing = merged.get(normalized.id);
      merged.set(normalized.id, {
        ...existing,
        ...normalized,
        cachedAt: Date.now(),
      });
    }
  }

  return Array.from(merged.values());
};

const scoreUser = (user: FoundBoaUser, cleanQuery: string) => {
  const username = user.username.toLowerCase();
  const name = (user.name || '').toLowerCase();

  if (!cleanQuery) return 1;
  if (username === cleanQuery) return 1000;
  if (username.startsWith(cleanQuery)) return 900 - username.length;
  if (name.startsWith(cleanQuery)) return 700 - name.length;
  if (username.includes(cleanQuery)) return 500 - username.indexOf(cleanQuery);
  if (name.includes(cleanQuery)) return 300 - name.indexOf(cleanQuery);

  return 0;
};

const sortUsers = (users: CachedBoaUser[], cleanQuery: string) => {
  return [...users].sort((left, right) => {
    const scoreDiff = scoreUser(right, cleanQuery) - scoreUser(left, cleanQuery);
    if (scoreDiff !== 0) return scoreDiff;

    const recencyDiff = (right.cachedAt || 0) - (left.cachedAt || 0);
    if (recencyDiff !== 0) return recencyDiff;

    return left.username.localeCompare(right.username);
  });
};

const filterCachedUsers = (users: CachedBoaUser[], cleanQuery: string, currentUserId: string) => {
  const normalizedQuery = cleanQuery.trim().toLowerCase();

  return users.filter((user) => {
    if (user.id === currentUserId) return false;
    if (!normalizedQuery) return true;

    const username = user.username.toLowerCase();
    const name = (user.name || '').toLowerCase();
    return username.includes(normalizedQuery) || name.includes(normalizedQuery);
  });
};

export function hydrateUserSearchCache(users: Array<Partial<FoundBoaUser> | null | undefined>) {
  const existing = readUserCache();
  const merged = mergeUsers(existing, users);
  writeUserCache(sortUsers(merged, ''));
}

export function searchCachedBoaUsers(query: string, currentUserId: string, limit = 10): FoundBoaUser[] {
  const cleanQuery = query.replace('@', '').trim().toLowerCase();
  const cachedUsers = readUserCache();
  const filtered = filterCachedUsers(cachedUsers, cleanQuery, currentUserId);
  return sortUsers(filtered, cleanQuery).slice(0, limit);
}

export async function prefetchBoaUsers(currentUserId: string, limit = 30): Promise<FoundBoaUser[]> {
  const cached = searchCachedBoaUsers('', currentUserId, limit);

  try {
    const { data } = await withTimeout(
      supabase
        .from('users')
        .select('id, name, username')
        .not('username', 'is', null)
        .neq('id', currentUserId)
        .order('username', { ascending: true })
        .limit(limit),
      4000,
      'User prefetch timed out'
    );

    const remoteUsers = ((data as FoundBoaUser[] | null) || [])
      .map(normalizeFoundUser)
      .filter(Boolean) as FoundBoaUser[];

    if (remoteUsers.length > 0) {
      hydrateUserSearchCache(remoteUsers);
      return searchCachedBoaUsers('', currentUserId, limit);
    }
  } catch {
    // fall back to cache only
  }

  return cached;
}

export async function searchBoaUsers(query: string, currentUserId: string, limit = 10): Promise<FoundBoaUser[]> {
  const cleanQuery = query.replace('@', '').trim().toLowerCase();
  const cached = searchCachedBoaUsers(cleanQuery, currentUserId, limit);

  if (!cleanQuery) return cached;

  try {
    const usernamePromise = withTimeout(
      supabase
        .from('users')
        .select('id, name, username')
        .not('username', 'is', null)
        .neq('id', currentUserId)
        .ilike('username', `${cleanQuery}%`)
        .limit(limit),
      3500,
      'Username search timed out'
    );

    const namePromise = cleanQuery.length >= 2
      ? withTimeout(
          supabase
            .from('users')
            .select('id, name, username')
            .not('username', 'is', null)
            .neq('id', currentUserId)
            .ilike('name', `%${cleanQuery}%`)
            .limit(limit),
          3500,
          'Name search timed out'
        )
      : Promise.resolve({ data: [] as FoundBoaUser[] });

    const [usernameResult, nameResult] = await Promise.allSettled([usernamePromise, namePromise]);

    const remoteUsers = mergeUsers(
      cached,
      usernameResult.status === 'fulfilled' ? (usernameResult.value.data as FoundBoaUser[] | null) : [],
      nameResult.status === 'fulfilled' ? (nameResult.value.data as FoundBoaUser[] | null) : []
    );

    if (remoteUsers.length > 0) {
      writeUserCache(sortUsers(mergeUsers(readUserCache(), remoteUsers), ''));
      return sortUsers(
        filterCachedUsers(remoteUsers, cleanQuery, currentUserId),
        cleanQuery
      ).slice(0, limit);
    }
  } catch {
    // use cache only
  }

  return cached;
}
