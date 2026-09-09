import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getEnvVar = (key: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || '';
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

const rawUrl = getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL');
if (!rawUrl) {
  throw new Error('Configuration error: SUPABASE_URL environment variable is required for admin client.');
}
export const supabaseAdminUrl = normalizeSupabaseUrl(rawUrl);

const secretKey = getEnvVar('SUPABASE_SECRET_KEY');
if (!secretKey) {
  throw new Error('Configuration error: SUPABASE_SECRET_KEY environment variable is required for admin client.');
}
export const supabaseAdminSecretKey = secretKey;

export const supabaseAdmin: SupabaseClient = createClient(supabaseAdminUrl, supabaseAdminSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
