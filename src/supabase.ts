import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xrnfgdyqkqqpxjwpmkta.supabase.co';
const supabaseAnonKey = 'sb_publishable_kX5vf6Ocj3b7PljEywobMg_UL_MECHd';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // detectSessionInUrl must be false on native — we handle the OAuth callback
    // manually via appUrlOpen deep-link listener in App.tsx.
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: 'boawallet_auth_v3',
  },
});
