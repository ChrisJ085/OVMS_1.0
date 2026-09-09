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

const publishableKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY');
if (!publishableKey) {
  throw new Error('Configuration error: VITE_SUPABASE_PUBLISHABLE_KEY environment variable is required but not set.');
}
export const supabasePublishableKey = publishableKey;

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabasePublishableKey) &&
    !supabaseUrl.includes('placeholder') &&
    !supabasePublishableKey.includes('placeholder')
  );
};

export const supabase: SupabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});


