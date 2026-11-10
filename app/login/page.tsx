import { supabaseConfig } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Setup } from '@/features/auth/setup';
import { LoginForm } from '@/features/auth/login-form';
import { ChartNoAxesCombined } from 'lucide-react';
export default async function Login() {
  if(!supabaseConfig())return <Setup/>;
  const client=await supabaseServer();
  const {data:{user}}=await client.auth.getUser();
  if(user)redirect('/');
  return <div className="auth-page"><section className="auth-card"><span className="brand-mark"><ChartNoAxesCombined size={24}/></span><div className="eyebrow">BEM-VINDO AO FINAI</div><h1>Seu dinheiro, seu espaço.</h1><p>Entre para acompanhar suas contas e dar o próximo passo.</p><LoginForm/></section></div>;
}
