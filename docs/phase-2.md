# Fase 2 — tema azul e conexão ao espaço real

## Entregue no código

- Identidade azul em cards, botões, navegação, foco, gráficos, login e estados de feedback. A identidade específica dos bancos de demonstração pode usar cores próprias.
- Rota principal autenticada; demonstração separada em `/demo`. Falta de configuração ou schema indisponível não causa fallback silencioso para números fictícios.
- Login e logout Supabase SSR, sessão verificada no backend e renovada via `proxy.ts`, cookies HttpOnly/SameSite=Lax; sem SDK Supabase no navegador, sem chave privilegiada.
- Espaço pessoal inicial vazio, criação de conta com saldo inicial inclusive negativo/zero, receitas/despesas, transferências, estorno integral, arquivamento de contas zeradas e histórico de eventos.
- Servidor valida parâmetros com Zod, datas civis em America/Fortaleza e centavos inteiros. Operações SQL também validam os dados para não depender da interface.
- Idempotência persistida com comparação de payload e ator; lock do workspace serializa operações críticas; erro de refresh após commit é distinguido de falha na gravação.
- Ledger balanceado, FK compostas de tenant, RLS em todas as tabelas novas, grants mínimos e auditoria append-only.
- Snapshot em uma instrução SQL evita misturar commits diferentes e evita truncar saldo no limite padrão de linhas do PostgREST. Centavos serializados como texto no JSON do banco e convertidos apenas dentro do intervalo seguro.
- Resumo do espaço pessoal é um cálculo determinístico sobre lançamentos reais confirmados, sem chamada de IA ou previsão. A demonstração continua identificada como simulação.

## Regras de contabilização

Saldo inicial usa contrapartida de patrimônio, não receita. Transferência move saldo sem participar de receitas/despesas. Estorno cria pernas inversas; o original permanece no histórico com marcação e é excluído dos totais de receitas/despesas em sua competência original (visão corrigida). Não apresentar esse relatório como um diário de caixa bruto de estornos. Arquivar exige saldo zero; estorno em conta arquivada é bloqueado para não recriar saldo oculto.

Somente lançamentos efetivados entre 1900 e a data financeira atual; compromissos futuros terão módulo separado. A primeira versão mantém um espaço pessoal por proprietário. Membership admite papéis owner/editor/viewer, mas a gestão de convites e múltiplos espaços não está na interface ainda. Saldo total inclui todo histórico registrado; filtro de mês afeta resultados, não saldo bancário atual.

## Projeto e configuração

URL e chave publicável do projeto informado foram configuradas em `.env.local`, ignorado pelo Git. A chave secreta enviada no chat não foi escrita no projeto nem usada pelo aplicativo. Nenhuma credencial consta neste documento.

A consulta ao endpoint público Auth settings retornou HTTP 200, e indicou cadastro público habilitado. Desativar `Allow new users to sign up` no Supabase antes da ativação pessoal. O aplicativo não oferece rota de signup; isso não substitui a configuração do provedor.

Chaves de dados do projeto não substituem credenciais da Management API para executar DDL ou configurar Auth. Conectar o Supabase ao chat permite inspecionar o schema e aplicar as migrations revisadas sob autorização. Não tentar executar SQL arbitrário por uma RPC genérica ou expor uma função exec_sql.

## Validação e limites

Testes de migrations e políticas executam PostgreSQL real compilado para WASM (PGlite), com schemas/roles auth mínimos para simular a identidade. Testam dois usuários, viewer, ausência de privilégios de escrita direta, FK entre tenants, saldos, transferência, idempotência com payload divergente, estorno, imutabilidade, auditoria, arquivamento, datas futuras e anônimo. Isso **não** verifica o emissor JWT do Supabase nem concorrência entre conexões independentes de PostgreSQL. Essas verificações continuam necessárias no ambiente Supabase de teste.

Antes da liberação real, verificar com dois usuários reais: login/logout, sessão expirada, confirmação e persistência após reload; leitura e tentativa de mutação cruzadas por REST/RPC; mesma chave enviada simultaneamente por conexões independentes; fechamento do cadastro público; política de backup. Nenhum desses checks remotos pode ser declarado aprovado sem execução.

Build de produção e tipagem aprovados. 30 testes unitários/PostgreSQL aprovados e 8 testes de navegador aprovados (desktop e mobile). O navegador verifica demo azul, confirmação/cancelamento, filtro vazio, ausência de overflow e proteção do espaço pessoal por login; não simula um login remoto bem-sucedido como se tivesse sido validado. Sem migrations remotas, criação de usuários remotos, commit ou deploy nesta preparação.

O arquivo `supabase/setup-finai.sql` reúne as três migrations em uma transação única para revisão ou execução pelo SQL Editor. É gerado por `node scripts/prepare-database.mjs`; esse comando apenas cria o arquivo local. Antes da aplicação, conferir se os nomes novos não colidem com objetos existentes. Se aplicado manualmente no SQL Editor, registrar essa aplicação e reconciliar o histórico do CLI antes de qualquer futuro `db push`; o bundle não altera `supabase_migrations` automaticamente.

## Arquivos principais alterados/criados

- `.env.example`, `.env.local` local ignorado; `package.json`/lockfile.
- `app/page.tsx`, `app/login/page.tsx`, `app/demo/page.tsx`, `app/auth/actions.ts`, `app/globals.css`, `proxy.ts`.
- `features/auth/setup.tsx`, `features/auth/login-form.tsx`, `features/dashboard/dashboard.tsx`, `features/dashboard/cash-flow-chart.tsx`.
- `features/finance/domain.ts`, `features/finance/commands.ts`, `features/finance/live-controls.tsx`.
- `lib/supabase/config.ts`, `lib/supabase/server.ts`, `lib/dates.ts`, `server/finance/actions.ts`, `server/finance/snapshot.ts`.
- `types/finance.ts`, `types/snapshot.ts`, `services/financial-summary.ts`, `services/mock-finance.ts`.
- `supabase/migrations/202611090001_foundation.sql`, `202611090002_commands.sql`, `202611090003_snapshot.sql` e README.
- `tests/database.test.ts`, `tests/commands.test.ts`, `tests/finance.test.ts`, `tests/e2e/dashboard.spec.ts`, `vitest.config.mts` e documentação.
- `tests/e2e/auth.spec.ts`, `scripts/prepare-database.mjs`, `supabase/setup-finai.sql`.

## Serviços e custos

Downloads npm públicos e consulta à configuração pública do projeto Supabase. Sem IA paga, sem plano adquirido, sem integração bancária/Open Finance, sem deploy. Quando o usuário fizer login, as chamadas usarão o projeto Supabase já existente e suas cotas. A aplicação não acessa automaticamente bancos: lançamentos são manuais nesta fase.

## Referências

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/api-keys
- https://pglite.dev/docs/
- Documentação instalada: `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `authentication.md`, `03-api-reference/04-functions/cookies.md`, `03-api-reference/03-file-conventions/proxy.md`.
