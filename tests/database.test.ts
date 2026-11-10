import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

let db: PGlite;
async function asUser(id: string) { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); }
async function user() {
  const id=randomUUID(); await db.exec('reset role'); await db.query('insert into auth.users(id) values($1)',[id]); await asUser(id);
  const result=await db.query<{w:string}>('select public.initialize_finai() as w');
  return {id,w:result.rows[0].w};
}
async function account(w:string,amount=10000) {
  const result=await db.query<{r:{accountId:string}}>("select public.create_finai_account($1,$2,'Conta','bank',$3,'2026-01-01') as r",[w,randomUUID(),amount]); return result.rows[0].r.accountId;
}
async function snapshot(w:string) {
  const result=await db.query<{s:{accounts:{id:string;balance:string}[];transactions:{reversed:boolean}[];events:{id:string;kind:string}[]}}>('select public.read_finai_snapshot($1) as s',[w]);return result.rows[0].s;
}
async function transaction(w:string,a:string,key=randomUUID(),amount=1234) {
  const result=await db.query<{r:{eventId:string}}>("select public.post_finai_transaction($1,$2,$3,'expense',$4,'2026-01-02','Mercado','Alimentação') as r",[w,key,a,amount]); return result.rows[0].r;
}
describe('PostgreSQL real em WASM: migrations, RLS e comandos',()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated,anon;");
    for(const name of ['202611090001_foundation.sql','202611090002_commands.sql','202611090003_snapshot.sql'])await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
  },60_000);
  afterAll(async()=>{await db.close();});
  it('isola leitura e escrita de dois usuários e não permite inserts diretos',async()=>{
    const first=await user();const a=await account(first.w);const second=await user();
    expect((await db.query('select * from public.accounts')).rows).toHaveLength(0);
    expect(await snapshot(first.w)).toBeNull();
    await expect(transaction(first.w,a)).rejects.toThrow('workspace_denied');
    await expect(db.query("insert into public.accounts(workspace_id,name,kind) values($1,'Intruso','bank')",[second.w])).rejects.toThrow(/permission denied/);
  });
  it('mantém saldo inicial fora de receitas e despesas',async()=>{
    const {w}=await user();await account(w);const s=await snapshot(w);
    expect(s.accounts[0].balance).toBe('10000');expect(s.transactions).toEqual([]);
  });
  it('transfere duas pernas sem criar receita/despesa e rejeita mesma conta',async()=>{
    const {w}=await user();const a=await account(w);const b=await account(w,0);
    await db.query("select public.transfer_finai($1,$2,$3,$4,2500,'2026-01-02','Entre contas')",[w,randomUUID(),a,b]);
    const s=await snapshot(w);expect(s.accounts.find(v=>v.id===a)?.balance).toBe('7500');expect(s.accounts.find(v=>v.id===b)?.balance).toBe('2500');expect(s.transactions).toHaveLength(0);
    await expect(db.query("select public.transfer_finai($1,$2,$3,$3,1,'2026-01-02','Inválida')",[w,randomUUID(),a])).rejects.toThrow('invalid_transfer');
  });
  it('repete mesma chave sem duplicar e rejeita payload divergente',async()=>{
    const {w}=await user();const a=await account(w);const key=randomUUID();
    const first=await transaction(w,a,key);expect(await transaction(w,a,key)).toEqual(first);
    await expect(transaction(w,a,key,999)).rejects.toThrow('idempotency_conflict');
    expect((await snapshot(w)).accounts[0].balance).toBe('8766');
    expect((await snapshot(w)).transactions).toHaveLength(1);
  });
  it('não permite movimentação com conta de outro workspace; falha é atômica',async()=>{
    const first=await user();const a=await account(first.w);const second=await user();
    await expect(transaction(second.w,a)).rejects.toThrow('account_denied');
    expect((await snapshot(second.w)).events).toEqual([]);
  });
  it('estorna sem apagar histórico e impede duplo estorno',async()=>{
    const {w}=await user();const a=await account(w);const t=await transaction(w,a);
    await db.query("select public.reverse_finai($1,$2,$3,'Correção')",[w,randomUUID(),t.eventId]);
    const s=await snapshot(w);expect(s.accounts[0].balance).toBe('10000');expect(s.transactions[0].reversed).toBe(true);expect(s.events.some(e=>e.kind==='reversal')).toBe(true);
    await expect(db.query("select public.reverse_finai($1,$2,$3,'De novo')",[w,randomUUID(),t.eventId])).rejects.toThrow('already_reversed');
    await db.exec('reset role');
    await expect(db.query('delete from public.financial_events where id=$1',[t.eventId])).rejects.toThrow('immutable_financial_record');
  });
  it('impede arquivo de conta com saldo e produz auditoria',async()=>{
    const {w}=await user();const a=await account(w);
    await expect(db.query('select public.archive_finai_account($1,$2)',[w,a])).rejects.toThrow('nonzero_balance');
    const rows=await db.query<{action:string}>('select action from public.audit_events where workspace_id=$1',[w]);expect(rows.rows.map(r=>r.action)).toContain('account.created');
  });
  it('viewer pode ler mas não movimentar nem se promover',async()=>{
    const owner=await user();const a=await account(owner.w);const viewer=await user();
    await db.exec('reset role');await db.query("insert into public.workspace_members values($1,$2,'viewer')",[owner.w,viewer.id]);await asUser(viewer.id);
    expect((await snapshot(owner.w)).accounts).toHaveLength(1);
    await expect(transaction(owner.w,a)).rejects.toThrow('workspace_denied');
    await expect(db.query("update public.workspace_members set role='owner' where workspace_id=$1 and user_id=$2",[owner.w,viewer.id])).rejects.toThrow(/permission denied/);
  });
  it('rejeita evento desequilibrado na confirmação da transação',async()=>{
    const {w}=await user();const a=await account(w);await db.exec('reset role');
    try {
      await expect(db.exec(`begin; insert into public.financial_events(id,workspace_id,kind,description,effective_date,created_by) values('11111111-1111-4111-8111-111111111111','${w}','expense','Teste','2026-01-01',(select owner_id from public.workspaces where id='${w}')); insert into public.ledger_entries(workspace_id,event_id,account_id,bucket,amount_cents) values('${w}','11111111-1111-4111-8111-111111111111','${a}','asset',1); commit;`)).rejects.toThrow('unbalanced_event');
    }finally{await db.exec('rollback');}
  });
  it('anônimo não pode executar funções financeiras',async()=>{
    await db.exec('reset role; set role anon;');
    await expect(db.query('select public.initialize_finai()')).rejects.toThrow(/permission denied/);
  });
  it('rejeita datas futuras também na função SQL',async()=>{
    const {w}=await user();const a=await account(w);
    await expect(db.query("select public.post_finai_transaction($1,$2,$3,'expense',100,'2999-01-01','Futura','Outros')",[w,randomUUID(),a])).rejects.toThrow('invalid_transaction');
    expect((await snapshot(w)).transactions).toEqual([]);
  });
  it('arquiva conta zerada uma vez e impede novos lançamentos',async()=>{
    const {w}=await user();const a=await account(w,0);
    await db.query('select public.archive_finai_account($1,$2)',[w,a]);
    await db.query('select public.archive_finai_account($1,$2)',[w,a]);
    await expect(transaction(w,a)).rejects.toThrow('account_denied');
    const audit=await db.query("select id from public.audit_events where workspace_id=$1 and action='account.archived'",[w]);expect(audit.rows).toHaveLength(1);
  });
  it('a FK composta rejeita conta de outro tenant mesmo para o dono do banco',async()=>{
    const first=await user();const a=await account(first.w);const second=await user();const b=await account(second.w);await transaction(second.w,b);
    const s=await snapshot(second.w);const event=s.events.find(e=>e.kind==='expense')!;
    await db.exec('reset role');
    await expect(db.query("insert into public.ledger_entries(workspace_id,event_id,account_id,bucket,amount_cents) values($1,$2,$3,'asset',1)",[second.w,event.id,a])).rejects.toThrow(/foreign key constraint/);
  });
});
