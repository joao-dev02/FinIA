-- OPTIONAL. Review and explicitly authorize before running remotely.
-- Requires phase 3 migrations and pg_cron support in the target Supabase project.
-- No ledger entry or automatic payment: creates pending commitments only.
begin;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
do $$
begin
 if not exists(select 1 from cron.job where jobname='finai-recurring-agenda') then
  -- 03:15 UTC = 00:15 America/Fortaleza.
  perform cron.schedule('finai-recurring-agenda','15 3 * * *','select finai_private.generate_all_rules();');
 end if;
end $$;
commit;
