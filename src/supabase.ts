import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xrnfgdyqkqqpxjwpmkta.supabase.co';
const supabaseAnonKey = 'sb_publishable_kX5vf6Ocj3b7PljEywobMg_UL_MECHd';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
