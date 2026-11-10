Fase 2: migrations executáveis preparadas e testadas localmente, sem aplicação remota automática.

1. `202611090001_foundation.sql`: workspaces, memberships, contas, categorias, ledger balanceado, transações, transferências, auditoria, idempotência, RLS e grants.
2. `202611090002_commands.sql`: comandos autenticados de inicialização, criação de conta, lançamento, transferência, estorno e arquivamento.
3. `202611090003_snapshot.sql`: leitura consistente em uma única instrução SQL, com RLS.

Antes de aplicar: confirmar projeto, inspecionar colisões com tabelas/funções existentes, backup, autorização explícita e configuração do Auth. Os CREATEs não sobrescrevem objetos existentes: colisão deve abortar, nunca ser contornada apagando dados. Cada arquivo é transacional; se uma fase falhar após arquivos anteriores terem sido aplicados, revisar o estado antes de repetir. Não há rollback destrutivo automático.

O modelo mais amplo das fases futuras está em `docs/data-model.md`. Sem cartões, anexos, metas, jobs ou IA persistida nesta migration.
