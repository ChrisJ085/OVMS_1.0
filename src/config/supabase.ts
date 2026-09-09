import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getEnvVar = (viteKey: string, processKey: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
    return import.meta.env[viteKey];
  }
  if (typeof process !== 'undefined' && process.env && process.env[processKey]) {
    return process.env[processKey] || '';
  }
  return '';
};

const normalizeSupabaseUrl = (url: string): string => {
  if (!url) return '';
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, '');
  cleaned = cleaned.replace(/\/$/, '');
  return cleaned;
};

const rawUrl = getEnvVar('VITE_SUPABASE_URL', 'SUPABASE_URL');
if (!rawUrl) {
  throw new Error('Configuration error: VITE_SUPABASE_URL environment variable is required but not set.');
}
export const supabaseUrl = normalizeSupabaseUrl(rawUrl);

const anonKey = getEnvVar('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
if (!anonKey) {
  throw new Error('Configuration error: VITE_SUPABASE_ANON_KEY environment variable is required but not set.');
}
export const supabaseAnonKey = anonKey;

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    !supabaseUrl.includes('placeholder') &&
    !supabaseAnonKey.includes('placeholder')
  );
};

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

