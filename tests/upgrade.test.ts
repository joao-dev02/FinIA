import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const wUser='11111111-1111-4111-8111-111111111111';
async function existingDatabase(){
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;");
 await db.exec(readFileSync('supabase/setup-finai.sql','utf8'));
 await db.exec(`insert into auth.users values('${wUser}');set role authenticated;select set_config('request.jwt.claim.sub','${wUser}',false);`);
 const {rows:[{w}]}=await db.query<{w:string}>('select public.initialize_finai() as w');
 const {rows:[{a}]}=await db.query<{a:{accountId:string}}>("select public.create_finai_account($1,'22222222-2222-4222-8222-222222222222','Conta existente','bank',10000,'2026-01-01') as a",[w]);
 await db.query("select public.post_finai_transaction($1,'33333333-3333-4333-8333-333333333333',$2,'expense',1234,'2026-01-02','Despesa existente','Outros')",[w,a.accountId]);
 await db.exec('reset role');return {db,w};
}
describe('Atualização incremental de um banco da fase 2',()=>{
 it('fase 4 preserva dados da fase 3 e acrescenta reservas sem mexer no saldo',async()=>{
  const {db,w}=await existingDatabase();try{
   await db.exec(readFileSync('supabase/update-phase-3.sql','utf8'));await db.exec(readFileSync('supabase/update-phase-4.sql','utf8'));
   await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${wUser}',false);`);
   const g=await db.query<{g:{goalId:string}}>("select public.create_finai_goal($1,gen_random_uuid(),'Meta',5000,(now()::date+365)) as g",[w]);
   const a=await db.query<{id:string}>('select id from public.accounts where workspace_id=$1',[w]);
   await db.query("select public.allocate_finai_goal($1,gen_random_uuid(),$2,$3,1000,'reserve')",[w,g.rows[0].g.goalId,a.rows[0].id]);
   const {rows}=await db.query<{s:{accounts:{balance:string;reserved:string}[];transactions:unknown[];goals:{ready:boolean};credit:{ready:boolean}}}>('select public.read_finai_goal_snapshot($1) as s',[w]);expect(rows[0].s.accounts[0]).toMatchObject({balance:'8766',reserved:'1000'});expect(rows[0].s.transactions).toHaveLength(1);expect(rows[0].s.goals.ready).toBe(true);expect(rows[0].s.credit.ready).toBe(true);
  }finally{await db.close();}
 },60_000);
 it('aplica o bundle inteiro preservando saldo e histórico existentes',async()=>{
  const {db,w}=await existingDatabase();try{
   await db.exec(readFileSync('supabase/update-phase-3.sql','utf8'));
   await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${wUser}',false);`);
   const {rows}=await db.query<{s:{accounts:{balance:string}[];transactions:{description:string}[];credit:{ready:boolean}}}>('select public.read_finai_credit_snapshot($1) as s',[w]);
   expect(rows[0].s.accounts[0].balance).toBe('8766');expect(rows[0].s.transactions[0].description).toBe('Despesa existente');expect(rows[0].s.credit.ready).toBe(true);
  }finally{await db.close();}
 },60_000);
 it('colisão de objeto aborta o bundle sem deixar alterações parciais',async()=>{
  const {db,w}=await existingDatabase();try{
   await db.exec("create table public.cards(note text);insert into public.cards values('Objeto anterior');");
   await expect(db.exec(readFileSync('supabase/update-phase-3.sql','utf8'))).rejects.toThrow(/already exists/);await db.exec('rollback');
   const {rows}=await db.query<{note:string}>('select note from public.cards');expect(rows[0].note).toBe('Objeto anterior');
   const constraints=await db.query<{definition:string}>("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.financial_events'::regclass and conname='financial_events_kind_check'");expect(constraints.rows[0].definition).not.toContain('card_purchase');
   await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${wUser}',false);`);
   const s=await db.query<{s:{accounts:{balance:string}[]}}>('select public.read_finai_snapshot($1) as s',[w]);expect(s.rows[0].s.accounts[0].balance).toBe('8766');
  }finally{await db.close();}
 },60_000);
});
