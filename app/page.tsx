import { Dashboard } from '@/features/dashboard/dashboard';
import { supabaseConfig } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import { readSnapshot } from '@/server/finance/snapshot';
import { Setup } from '@/features/auth/setup';
import { redirect } from 'next/navigation';
export default async function Page() {
  if(!supabaseConfig())return <Setup/>;
  const client=await supabaseServer();
  const {data:{user}}=await client.auth.getUser();
  if(!user)redirect('/login');
  try { return <Dashboard initialState={await readSnapshot()}/>; }
  catch { return <Setup databaseError/>; }
}
