import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabasePublishableKey } from './supabase';

export const supabaseNoPersist = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
