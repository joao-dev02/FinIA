import 'server-only';
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(parsed.hostname)) throw new Error('Supabase exige HTTPS fora do ambiente local.');
  return { url, key };
}
