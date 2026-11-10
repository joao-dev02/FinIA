import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || request.nextUrl.pathname.startsWith('/demo')) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: 'lax' }));
      }
    }
  });
  await client.auth.getUser();
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config = { matcher: ['/', '/login', '/auth/:path*'] };
