import { Dashboard } from '@/features/dashboard/dashboard';
import { supabaseConfig } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import { readSnapshot } from '@/server/finance/snapshot';
import { Setup } from '@/features/auth/setup';
import { redirect } from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<{workspace?:string;view?:string}>}) {
  if(!supabaseConfig())return <Setup/>;
  const client=await supabaseServer();
  const {data:{user}}=await client.auth.getUser();
  if(!user)redirect('/login');
  const query=await searchParams;
  try { const snapshot=await readSnapshot(query.workspace);return <Dashboard key={snapshot.workspaceId??'new'} initialState={snapshot} initialView={query.view==='reports'?'reports':undefined}/>; }
  catch(error) { if(error instanceof Error&&error.message==='WORKSPACE_DENIED')redirect('/');return <Setup databaseError/>; }
}
