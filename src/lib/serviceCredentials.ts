export interface ServiceCredentials {
  username?: string;
  password?: string;
}

const CREDENTIALS_START = '[[BOA_CREDENTIALS:';
const CREDENTIALS_END = ']]';

const encodePayload = (payload: string) => {
  try {
    return btoa(unescape(encodeURIComponent(payload)));
  } catch {
    return '';
  }
};

const decodePayload = (payload: string) => {
  try {
    return decodeURIComponent(escape(atob(payload)));
  } catch {
    return '';
  }
};

export function embedCredentialsInNotes(notes?: string, credentials?: ServiceCredentials): string | undefined {
  const visibleNotes = stripCredentialsFromNotes(notes).notes;
  const username = credentials?.username?.trim() || '';
  const password = credentials?.password?.trim() || '';

  if (!username && !password) {
    return visibleNotes || undefined;
  }

  const encoded = encodePayload(JSON.stringify({ username, password }));
  const prefix = encoded ? `${CREDENTIALS_START}${encoded}${CREDENTIALS_END}` : '';

  if (!prefix) return visibleNotes || undefined;
  return [prefix, visibleNotes].filter(Boolean).join('\n');
}

export function stripCredentialsFromNotes(notes?: string): {
  notes?: string;
  credentials?: ServiceCredentials;
} {
  const rawNotes = (notes || '').trim();
  if (!rawNotes.startsWith(CREDENTIALS_START)) {
    return { notes: notes || undefined };
  }

  const endIndex = rawNotes.indexOf(CREDENTIALS_END);
  if (endIndex === -1) {
    return { notes: notes || undefined };
  }

  const encoded = rawNotes.slice(CREDENTIALS_START.length, endIndex);
  const decoded = decodePayload(encoded);

  let credentials: ServiceCredentials | undefined;
  try {
    const parsed = JSON.parse(decoded);
    credentials = {
      username: typeof parsed?.username === 'string' && parsed.username.trim() ? parsed.username.trim() : undefined,
      password: typeof parsed?.password === 'string' && parsed.password.trim() ? parsed.password.trim() : undefined,
    };
  } catch {
    credentials = undefined;
  }

  const cleanedNotes = rawNotes.slice(endIndex + CREDENTIALS_END.length).trim();
  return {
    notes: cleanedNotes || undefined,
    credentials,
  };
}
