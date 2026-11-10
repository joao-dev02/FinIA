'use client';
import { useActionState } from 'react';
import { signIn } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
export function LoginForm() {
  const [state,action,pending]=useActionState(signIn,{error:''});
  return <form action={action} className="auth-form"><label>E-mail<input type="email" name="email" autoComplete="email" required/></label><label>Senha<input type="password" name="password" autoComplete="current-password" required maxLength={256}/></label>{state.error && <p role="alert" className="error">{state.error}</p>}<Button disabled={pending}>{pending?'Entrando…':'Entrar no meu espaço'}</Button><small>Acesso por convite. O cadastro público está desativado no aplicativo.</small></form>;
}
