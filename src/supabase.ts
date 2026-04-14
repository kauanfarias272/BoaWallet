import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xrnfgdyqkqqpxjwpmkta.supabase.co';
const supabaseAnonKey = 'sb_publishable_kX5vf6Ocj3b7PljEywobMg_UL_MECHd';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE flow required for the redirect-based OAuth used on Android
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    // Do NOT let Supabase try to detect session from the URL automatically —
    // we do it ourselves via appUrlOpen so it works on Android deep links too
    detectSessionInUrl: false,
    storageKey: 'boawallet_auth_v2',
  },
});
