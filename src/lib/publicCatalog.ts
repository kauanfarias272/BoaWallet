import { Subscription } from '../types';

export const PUBLIC_SERVICE_BUCKETS = [
  'Todos',
  // Streaming vídeo
  'Netflix', 'Disney+', 'HBO Max', 'Prime Video', 'Apple TV+', 'Hulu', 'Paramount+', 'Crunchyroll',
  // Streaming música
  'Spotify', 'Apple Music', 'Deezer', 'Tidal', 'YouTube Music',
  // Criatividade & produtividade
  'Adobe', 'Canva', 'Figma', 'Notion', 'Microsoft 365',
  // Cloud & tech
  'Google One', 'iCloud', 'Dropbox', 'GitHub',
  // Jogos
  'Xbox Game Pass', 'PlayStation Plus', 'Nintendo Switch Online', 'EA Play', 'Twitch',
  // Outros
  'YouTube Premium', 'LinkedIn', 'Duolingo', 'Outros',
] as const;

export type PublicServiceBucket = typeof PUBLIC_SERVICE_BUCKETS[number];

const SERVICE_KEYWORDS: Array<{ bucket: Exclude<PublicServiceBucket, 'Todos'>; keywords: string[] }> = [
  { bucket: 'Netflix',             keywords: ['netflix'] },
  { bucket: 'Disney+',             keywords: ['disney', 'disney plus', 'disneyplus'] },
  { bucket: 'HBO Max',             keywords: ['hbo', 'max', 'hbomax', 'hbo max'] },
  { bucket: 'Prime Video',         keywords: ['prime video', 'amazon prime', 'prime'] },
  { bucket: 'Apple TV+',           keywords: ['apple tv', 'appletv'] },
  { bucket: 'Hulu',                keywords: ['hulu'] },
  { bucket: 'Paramount+',          keywords: ['paramount'] },
  { bucket: 'Crunchyroll',         keywords: ['crunchyroll'] },
  { bucket: 'Spotify',             keywords: ['spotify'] },
  { bucket: 'Apple Music',         keywords: ['apple music'] },
  { bucket: 'Deezer',              keywords: ['deezer'] },
  { bucket: 'Tidal',               keywords: ['tidal'] },
  { bucket: 'YouTube Music',       keywords: ['youtube music', 'ytmusic'] },
  { bucket: 'Adobe',               keywords: ['adobe', 'photoshop', 'illustrator', 'premiere', 'creative cloud'] },
  { bucket: 'Canva',               keywords: ['canva'] },
  { bucket: 'Figma',               keywords: ['figma'] },
  { bucket: 'Notion',              keywords: ['notion'] },
  { bucket: 'Microsoft 365',       keywords: ['microsoft', 'office 365', 'microsoft 365', 'office365'] },
  { bucket: 'Google One',          keywords: ['google one', 'google drive', 'google storage'] },
  { bucket: 'iCloud',              keywords: ['icloud'] },
  { bucket: 'Dropbox',             keywords: ['dropbox'] },
  { bucket: 'GitHub',              keywords: ['github'] },
  { bucket: 'Xbox Game Pass',      keywords: ['xbox', 'game pass', 'xgp'] },
  { bucket: 'PlayStation Plus',    keywords: ['playstation', 'ps plus', 'ps+', 'psplus'] },
  { bucket: 'Nintendo Switch Online', keywords: ['nintendo', 'switch online'] },
  { bucket: 'EA Play',             keywords: ['ea play', 'ea games', 'origin'] },
  { bucket: 'Twitch',              keywords: ['twitch'] },
  { bucket: 'YouTube Premium',     keywords: ['youtube premium', 'youtube'] },
  { bucket: 'LinkedIn',            keywords: ['linkedin'] },
  { bucket: 'Duolingo',            keywords: ['duolingo'] },
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function getPublicServiceBucket(name?: string): PublicServiceBucket {
  const normalized = normalizeText(name || '');

  for (const candidate of SERVICE_KEYWORDS) {
    if (candidate.keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return candidate.bucket;
    }
  }

  return 'Outros';
}

export function getMarketplaceCategoryLabel(subscription: Subscription) {
  return subscription.category || 'Outros';
}

export function matchesMarketplaceSearch(subscription: Subscription, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const owner = (subscription as any)?.owner;
  const haystack = [
    subscription.name,
    subscription.category,
    getPublicServiceBucket(subscription.name),
    subscription.sharedOwnerUsername,
    subscription.sharedOwnerName,
    owner?.username,
    owner?.name,
  ]
    .filter(Boolean)
    .map((part) => normalizeText(String(part)))
    .join(' ');

  return haystack.includes(normalizedQuery);
}
