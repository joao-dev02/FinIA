import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
export async function supabaseServer() {
  const config = supabaseConfig();
  if (!config) throw new Error('SUPABASE_NOT_CONFIGURED');
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { for (const { name, value, options } of values) store.set(name, value, { ...options, sameSite: 'lax', httpOnly: true }); }
        catch { /* Server Components cannot set cookies; proxy refreshes them. */ }
      }
    }
  });
}
