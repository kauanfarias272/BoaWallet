import {
  type SimpleIcon,
  siHbomax,
  siMax,
  siNba,
  siNetflix,
  siRevolut,
  siSpotify,
  siYoutube,
} from 'simple-icons';

const LOGO_CODE_PREFIX = 'boa:';

function normalizeServiceName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const SERVICE_ALIAS_LIST: Array<[string, string]> = [
  ['Netflix', 'netflix.com'],
  ['YouTube', 'youtube.com'],
  ['YouTube Premium', 'youtube.com'],
  ['YouTube Music', 'youtube.com'],
  ['Disney+', 'disneyplus.com'],
  ['Disney Plus', 'disneyplus.com'],
  ['HBO Max', 'play.hbomax.com'],
  ['Max', 'max.com'],
  ['Amazon Prime', 'primevideo.com'],
  ['Amazon Prime Video', 'primevideo.com'],
  ['Apple Music', 'apple.com'],
  ['Apple TV+', 'tv.apple.com'],
  ['Apple TV', 'tv.apple.com'],
  ['Spotify', 'spotify.com'],
  ['Xbox Game Pass', 'xbox.com'],
  ['PlayStation Plus', 'playstation.com'],
  ['Adobe Creative Cloud', 'adobe.com'],
  ['Microsoft 365', 'microsoft.com'],
  ['ChatGPT', 'chatgpt.com'],
  ['GitHub Copilot', 'github.com'],
  ['GitHub', 'github.com'],
  ['Crunchyroll', 'crunchyroll.com'],
  ['Google One', 'one.google.com'],
  ['iCloud', 'icloud.com'],
  ['Dropbox', 'dropbox.com'],
  ['Notion', 'notion.so'],
  ['Slack', 'slack.com'],
  ['Zoom', 'zoom.us'],
  ['Canva', 'canva.com'],
  ['Figma', 'figma.com'],
  ['Duolingo', 'duolingo.com'],
  ['Tinder', 'tinder.com'],
  ['Strava', 'strava.com'],
  ['Gympass', 'wellhub.com'],
  ['Wellhub', 'wellhub.com'],
  ['Twitch', 'twitch.tv'],
  ['Discord', 'discord.com'],
  ['Patreon', 'patreon.com'],
  ['Paramount+', 'paramountplus.com'],
  ['Paramount Plus', 'paramountplus.com'],
  ['Star+', 'starplus.com'],
  ['Star Plus', 'starplus.com'],
  ['Globoplay', 'globoplay.globo.com'],
  ['Deezer', 'deezer.com'],
  ['Tidal', 'tidal.com'],
  ['Claude', 'claude.ai'],
  ['Gemini', 'gemini.google.com'],
  ['LinkedIn Premium', 'linkedin.com'],
  ['LinkedIn', 'linkedin.com'],
  ['Twitter / X', 'x.com'],
  ['Twitter', 'x.com'],
  ['X', 'x.com'],
  ['iFood', 'ifood.com.br'],
  ['Uber Eats', 'ubereats.com'],
  ['Deliveroo', 'deliveroo.com'],
  ['Glovo', 'glovoapp.com'],
  ['Rappi', 'rappi.com'],
  ['Vivo', 'vivo.com.br'],
  ['Claro', 'claro.com.br'],
  ['TIM', 'tim.com.br'],
  ['Oi', 'oi.com.br'],
  ['Vodafone', 'vodafone.com'],
  ['T-Mobile', 't-mobile.com'],
  ['AT&T', 'att.com'],
  ['Iliad', 'iliad.it'],
  ['WindTre', 'windtre.it'],
  ['Uber', 'uber.com'],
  ['NordVPN', 'nordvpn.com'],
  ['1Password', '1password.com'],
  ['Audible', 'audible.com'],
  ['Revolut', 'revolut.com'],
  ['N26', 'n26.com'],
  ['Nubank', 'nubank.com.br'],
  ['Wise', 'wise.com'],
  ['Inter', 'inter.co'],
  ['Intesa Sanpaolo', 'intesasanpaolo.com'],
  ['Chase', 'chase.com'],
  ['Bank of America', 'bankofamerica.com'],
  ['Wells Fargo', 'wellsfargo.com'],
  ['Santander', 'santander.com.br'],
  ['Itau', 'itau.com.br'],
  ['Itaú', 'itau.com.br'],
  ['Bradesco', 'bradesco.com.br'],
  ['Caixa', 'caixa.gov.br'],
  ['Banco do Brasil', 'bb.com.br'],
  ['C6 Bank', 'c6bank.com.br'],
  ['Neon', 'neon.com.br'],
  ['Next', 'next.me'],
  ['PicPay', 'picpay.com'],
  ['Mercado Pago', 'mercadopago.com.br'],
  ['PayPal', 'paypal.com'],
  ['Stripe', 'stripe.com'],
  ['Izybank', 'izybank.com.br'],
  ['BBVA', 'bbva.com'],
  ['Buddybank', 'buddy.unicredit.it'],
  ['Monzo', 'monzo.com'],
  ['Starling', 'starlingbank.com'],
  ['YouTube TV', 'tv.youtube.com'],
  ['Truecaller', 'truecaller.com'],
  ['Scribd', 'scribd.com'],
  ['NBA', 'nba.com'],
  ['NBA League Pass', 'nba.com'],
  ['Anhanguera', 'anhanguera.com'],
  ['CapCut', 'capcut.com'],
  ['Grok', 'grok.com'],
  ['xAI', 'x.ai'],
];

const SERVICE_DOMAINS = Object.fromEntries(
  SERVICE_ALIAS_LIST.map(([alias, domain]) => [normalizeServiceName(alias), domain])
) as Record<string, string>;

const SORTED_SERVICE_KEYS = Object.keys(SERVICE_DOMAINS).sort((a, b) => b.length - a.length);

function iconDataUrl(icon: SimpleIcon): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${icon.title}">`,
    '<rect width="24" height="24" rx="6" fill="#ffffff"/>',
    `<path fill="#${icon.hex}" d="${icon.path}"/>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const LOCAL_ICON_BY_DOMAIN: Record<string, string> = {
  'netflix.com': iconDataUrl(siNetflix),
  'youtube.com': iconDataUrl(siYoutube),
  'tv.youtube.com': iconDataUrl(siYoutube),
  'spotify.com': iconDataUrl(siSpotify),
  'revolut.com': iconDataUrl(siRevolut),
  'nba.com': iconDataUrl(siNba),
  'max.com': iconDataUrl(siMax),
  'play.hbomax.com': iconDataUrl(siHbomax),
};

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^www\./, '');
}

export function logoCodeFromDomain(domain: string): string {
  return `${LOGO_CODE_PREFIX}${normalizeDomain(domain)}`;
}

export function isLogoCode(value: string | undefined): boolean {
  return !!value && value.startsWith(LOGO_CODE_PREFIX);
}

export function domainFromLogoCode(value: string | undefined): string | null {
  if (!isLogoCode(value)) return null;
  return value!.slice(LOGO_CODE_PREFIX.length) || null;
}

export function getKnownLogoDomain(name: string): string | null {
  const normalized = normalizeServiceName(name);
  if (!normalized) return null;

  const exactMatch = SERVICE_DOMAINS[normalized];
  if (exactMatch) return exactMatch;

  const compact = normalized.replace(/\s+/g, '');
  for (const key of SORTED_SERVICE_KEYS) {
    const compactKey = key.replace(/\s+/g, '');
    if (normalized.includes(key) || compact.includes(compactKey)) {
      return SERVICE_DOMAINS[key];
    }
  }

  return null;
}

function localLogoFromDomain(domain: string): string | null {
  const normalized = normalizeDomain(domain);
  return LOCAL_ICON_BY_DOMAIN[normalized] || null;
}

export function googleFaviconFromDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(normalized)}&sz=256`;
}

function resolveLogoUrlFromDomain(domain: string): string {
  return localLogoFromDomain(domain) || googleFaviconFromDomain(domain);
}

export function getClearbitLogoUrl(name: string): string | null {
  const domain = getKnownLogoDomain(name);
  return domain ? resolveLogoUrlFromDomain(domain) : null;
}

export function clearbitFromDomain(domain: string): string {
  return resolveLogoUrlFromDomain(domain);
}

export function domainFromFaviconUrl(faviconUrl: string): string | null {
  try {
    const googleMatch = faviconUrl.match(/[?&]domain=([^&]+)/);
    if (googleMatch) return normalizeDomain(decodeURIComponent(googleMatch[1]));

    const clearbitMatch = faviconUrl.match(/logo\.clearbit\.com\/([^?/#]+)/i);
    if (clearbitMatch) return normalizeDomain(decodeURIComponent(clearbitMatch[1]));

    const duckMatch = faviconUrl.match(/icons\.duckduckgo\.com\/ip3\/([^./?#]+(?:\.[^./?#]+)+)\.ico/i);
    if (duckMatch) return normalizeDomain(decodeURIComponent(duckMatch[1]));

    const url = new URL(faviconUrl);
    return normalizeDomain(url.hostname);
  } catch {
    return null;
  }
}

function domainFromLogoValue(value: string | undefined): string | null {
  if (!value || value.startsWith('data:')) return null;

  const fromCode = domainFromLogoCode(value);
  if (fromCode) return normalizeDomain(fromCode);

  return domainFromFaviconUrl(value);
}

export function bestLogoUrl(logoUrl: string | undefined, name: string): string | null {
  const knownDomain = getKnownLogoDomain(name);
  if (knownDomain) return resolveLogoUrlFromDomain(knownDomain);

  const storedDomain = domainFromLogoValue(logoUrl);
  if (storedDomain) return resolveLogoUrlFromDomain(storedDomain);

  return logoUrl || null;
}

export function normalizeLogoUrl(logoUrl: string | undefined, name: string): string {
  const knownDomain = getKnownLogoDomain(name);
  if (knownDomain) return logoCodeFromDomain(knownDomain);

  const storedDomain = domainFromLogoValue(logoUrl);
  if (storedDomain) return logoCodeFromDomain(storedDomain);

  return logoUrl || '';
}
