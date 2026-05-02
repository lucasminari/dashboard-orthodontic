import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// No servidor, prefere SERVICE_ROLE_KEY (bypassa RLS para inserts/updates).
// Cai para chave publica/anon se a service role nao estiver configurada.
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});