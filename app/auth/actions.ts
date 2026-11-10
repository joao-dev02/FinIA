'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
export async function signIn(_previous: { error: string }, form: FormData) {
  const input=z.object({email:z.email(),password:z.string().min(1).max(256)}).safeParse(Object.fromEntries(form));
  if(!input.success)return {error:'Informe seu e-mail e senha.'};
  try {
    const client=await supabaseServer();
    const {error}=await client.auth.signInWithPassword(input.data);
    if(error)return {error:'Não foi possível entrar. Confira suas credenciais ou aguarde antes de tentar novamente.'};
  } catch { return {error:'O serviço de acesso não está disponível. Verifique a conexão do Supabase.'}; }
  redirect('/');
}
export async function signOut() {
  const client=await supabaseServer();
  const {error}=await client.auth.signOut();
  if(error)throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
  redirect('/login');
}
