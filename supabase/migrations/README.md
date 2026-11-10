Fase 2: migrations executáveis preparadas e testadas localmente, sem aplicação remota automática.

1. `202611090001_foundation.sql`: workspaces, memberships, contas, categorias, ledger balanceado, transações, transferências, auditoria, idempotência, RLS e grants.
2. `202611090002_commands.sql`: comandos autenticados de inicialização, criação de conta, lançamento, transferência, estorno e arquivamento.
3. `202611090003_snapshot.sql`: leitura consistente em uma única instrução SQL, com RLS.

Antes de aplicar: confirmar projeto, inspecionar colisões com tabelas/funções existentes, backup, autorização explícita e configuração do Auth. Os CREATEs não sobrescrevem objetos existentes: colisão deve abortar, nunca ser contornada apagando dados. Cada arquivo é transacional; se uma fase falhar após arquivos anteriores terem sido aplicados, revisar o estado antes de repetir. Não há rollback destrutivo automático.

O modelo mais amplo das fases futuras está em `docs/data-model.md`. Sem cartões, anexos, metas, jobs ou IA persistida nesta migration.

## Fase 3 — atualização incremental

Migrations `202611100004` até `202611100008` adicionam cartões, parcelas, faturas, compromissos e recorrências. Veja `docs/phase-3.md`. Para um projeto com a fase 2 instalada, usar **somente** `supabase/update-phase-3.sql`, gerado por `scripts/prepare-phase-3.mjs`. O bundle executa as cinco migrations numa única transação e não altera o bundle original da fase 2.

O scheduler está separado em `supabase/optional/enable-recurring-cron.sql`: não executar como parte de testes locais ou da atualização principal. Precisa de suporte pg_cron e autorização específica.

## Fase 4 — metas e classificações

Migrations 009–010 acrescentam metas/reservas e classificação de despesas. `supabase/update-phase-4.sql` reúne ambas numa transação e depende da fase 3 instalada. Gerado por `scripts/prepare-phase-4.mjs`. Não repetir os bundles anteriores. Os limites de reserva são verificados no banco, incluindo movimentações financeiras já existentes.
