# Fase 4 — metas, reservas e relatórios

## Entrega local

Metas com valor-alvo, prazo, progresso, contas vinculadas e histórico de reservas; simulação de contribuição mensal; edição com controle de versão e arquivamento. Relatórios por competência com filtros de mês, conta/cartão, categoria e workspace; comparação de seis meses, categorias, classificação fixa/variável/não classificada, posição patrimonial registrada e projeção de caixa. Exportação CSV e PDF com os mesmos filtros.

## Reservas não criam dinheiro

O saldo continua derivado do ledger financeiro. Reservar para uma meta cria apenas uma alocação vinculada à conta e ao objetivo. Exemplo: saldo R$ 1.000, reserva R$ 300, saldo livre de reservas R$ 700; patrimônio não passa a ser R$ 1.300. Liberar a reserva não vira receita e não movimenta a conta.

A soma de reservas de uma conta não pode ultrapassar seu saldo; reserva de uma meta não ultrapassa seu alvo. A liberação não pode retirar de outra meta/conta nem tornar uma alocação negativa. As verificações são constraints diferidas no banco, além da validação dos comandos. Despesas, transferências, pagamento de faturas e estornos que consumiriam uma reserva são abortados por inteiro. O usuário deve liberar a reserva antes de registrar essa saída. Isso é uma restrição do FinAI, não um bloqueio real no banco: gastos feitos fora do aplicativo precisam ser conciliados após liberar a reserva correspondente.

Os comandos usam o lock de workspace já adotado pelas fases anteriores, evitando corrida entre reserva e movimentação. Edição de meta exige versão atual; alvo não pode cair abaixo da reserva existente. Arquivamento exige reserva zero. Alocações são append-only, incluindo liberações negativas, com auditoria. Alterações de meta e classificação guardam antes/depois no audit_events.details.

## Simulação

Contribuição mensal constante, a partir do mês seguinte na mesma data civil, sem rendimentos ou inflação. Usa divisão inteira arredondada para cima; dia inexistente é ajustado ao último dia do mês. Exibe quando a estimativa ultrapassa o prazo. Não é uma previsão de renda nem confirmação de capacidade financeira; o valor mensal é informado pelo usuário. Nenhuma movimentação é executada pela simulação.

## Relatórios e posição atual

Receitas/despesas excluem lançamentos estornados; compras de cartão são reconhecidas integralmente na compra; pagamentos de fatura e transferências não geram uma segunda despesa. Histórico mensal e CSV/PDF usam o mesmo filtro. Posição atual e projeção são explicitamente do workspace completo: filtros de mês/categoria/conta não reescrevem esses saldos.

Posição líquida registrada = saldos das contas menos passivo dos cartões cadastrados. Reservas não são novamente descontadas da posição líquida. Saldo livre de reservas = contas menos reservas, sem presumir que esse valor esteja livre de obrigações futuras. Outros bens, investimentos e dívidas não cadastrados não estão incluídos.

Despesas de compromissos com valor recorrente são marcadas como fixas; classificação explícita do usuário prevalece. Todas as demais começam como não classificadas, sem adivinhação baseada no nome da categoria. A classificação pode ser alterada com confirmação e auditoria sem modificar valor/data do lançamento.

Projeção de seis meses parte do saldo atual e usa apenas contas pendentes e restante das faturas registradas. Pendências vencidas entram no primeiro mês. Não repete receitas/despesas já realizadas, não soma compras de cartão outra vez e não inventa receitas ou gastos. Reservas são mantidas constantes; projeção de saldo livre mostra esse ajuste separadamente. A disponibilidade dos dados de cartões é indicada; a leitura anterior continua disponível enquanto migrations novas não foram aplicadas.

## Workspaces e exportação

O backend verifica membership antes de ler o workspace solicitado; troca de workspace recarrega os dados, mantendo o relatório selecionado quando iniciada pelo filtro. Os comandos financeiros retornam snapshot do workspace em que a operação ocorreu. Exportações repetem autenticação e validação do workspace no servidor, sem aceitar dados financeiros enviados pelo navegador. As políticas RLS continuam sendo aplicadas.

CSV usa UTF-8 com BOM, separador ponto e vírgula e campos entre aspas. Valores originais com prefixos de fórmula (`=`, `+`, `-`, `@`, inclusive após espaços/controles) recebem apóstrofo de proteção. Centavos inteiros também são exportados, sem conversão que perca precisão. Unicode e texto completo ficam no CSV.

PDF é um arquivo real gerado localmente por pdf-lib, sem provedor externo ou conversão de HTML. Paginação respeita a altura e largura do texto. Caracteres que não cabem na fonte padrão são simplificados para `?`; descrições longas são abreviadas no PDF, com indicação de usar CSV para o texto completo. Não há JavaScript, anexos ou conteúdo externo incorporado.

Downloads reais usam `/api/reports/export`, com parâmetros Zod, sessão validada, arquivo attachment e `Cache-Control: private, no-store`. Formato inválido retorna 400, sessão ausente 401, workspace indevido 403. Limite de 5.000 lançamentos por exportação, com erro explícito para restringir filtros; não há truncamento silencioso. A demonstração gera apenas arquivos de fixtures no navegador e não chama o Supabase para exportar.

## Banco e aplicação incremental

Novas tabelas: financial_goals, goal_allocations e expense_labels, com FKs compostas e RLS. Nova leitura `read_finai_goal_snapshot` inclui reservas e metadados numa única instrução SQL. Fallback estrito: se somente a RPC nova estiver ausente (PGRST202), usa a leitura da fase 3 e, se necessário, da fase 2. Não mascara falhas de autorização. Metas reais aguardam a atualização e não usam fixtures.

Aplicar **somente** `supabase/update-phase-4.sql` em projeto com fases 2 e 3 instaladas. Se a fase 3 ainda estiver pendente, aplicar primeiro `update-phase-3.sql`; não repetir um bundle já instalado. O script da fase 4 une migrations `202611100009_goals.sql` e `202611100010_goal_snapshot.sql` numa transação. Gerado com `node scripts/prepare-phase-4.mjs`. Não executar novamente o setup inicial e não remover dados para contornar colisões.

Não foi aplicada migration remota, criado job, feito commit/push ou deploy nesta fase. Não houve uso de IA ou serviço pago. A dependência pdf-lib foi baixada do registry público, fixada no package.json/lockfile, e a [documentação oficial](https://pdf-lib.js.org/docs/api/classes/pdfdocument) foi consultada.

## Verificação e limites

Testes locais cobrem reserva sem dupla contabilização, limites por conta/meta, liberação, replay, conflitos de versão, arquivo, RLS com dois usuários simulados, bloqueio de despesas/transferências/pagamentos que consumiriam reservas, classificação sem alteração de saldo, filtros, projeção, proteção CSV, PDF válido e autorização da exportação. Upgrade sobre dados anteriores preserva saldo e histórico. O PostgreSQL em WASM não substitui teste com JWTs reais ou concorrência entre conexões independentes no Supabase. A gravação real de metas e o download autenticado no projeto do usuário devem ser validados após a migration remota.

Build e tipagem aprovados. A suíte principal passou 77 testes de domínio, SQL, leitura e exportação; um teste adicional de precisão da posição/projeção foi acrescentado na revisão final. Os 18 cenários Playwright passaram em desktop/mobile, incluindo simulação, filtros, download efetivo de CSV/PDF e recusa de exportação sem autenticação. Capturas de metas e relatórios foram inspecionadas. Não foram usados dados reais do usuário nesses testes.

## Arquivos

- Domínio/UI: `features/goals/domain.ts`, `goals-panel.tsx`, `features/reports/domain.ts`, `reports-panel.tsx`, `features/dashboard/dashboard.tsx`, `app/globals.css`.
- Tipos e mocks: `types/goals.ts`, `types/finance.ts`, `types/snapshot.ts`, `services/mock-goals.ts`, `services/mock-finance.ts`.
- Backend: `server/finance/goal-actions.ts`, `goal-wire.ts`, `snapshot.ts`, `credit-wire.ts`, `actions.ts`, `credit-actions.ts`, `app/page.tsx`, `app/api/reports/export/route.ts`.
- Exportação: `services/reports/csv.ts`, `pdf.ts`, `package.json`, `package-lock.json`.
- Banco: migrations 009–010, `supabase/update-phase-4.sql`, `scripts/prepare-phase-4.mjs`.
- Testes: `tests/goals-database.test.ts`, `reports.test.ts`, `export-route.test.ts`, `snapshot.test.ts`, `upgrade.test.ts`, `tests/e2e/goals-reports.spec.ts`.
- Documentação: este documento, README e README de migrations.
