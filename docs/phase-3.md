# Fase 3 — cartões, faturas e compromissos

## Entrega

Cartões com nome, limite, fechamento e vencimento; compras à vista/parceladas; faturas abertas, fechadas e pagas; pagamento parcial ou total; antecipação de parcelas; cancelamento de compra antes do fechamento; contas a pagar/receber; recorrências mensais/anuais; liquidação e cancelamento de compromissos; histórico e próximos vencimentos no dashboard. Nenhum número completo de cartão, CVV, senha bancária ou dado de Open Finance é solicitado.

As operações reais continuam exigindo confirmação explícita, sessão validada no backend, membership de escrita e validação SQL. A demonstração mostra fixtures coerentes entre gastos e faturas, com formulários de prévia sem gravações externas.

## Contabilização

| Operação de exemplo | Saldo bancário | Despesa reconhecida | Dívida do cartão |
| --- | --- | --- | --- |
| Antes, conta com R$ 1.000 | R$ 1.000 | R$ 0 | R$ 0 |
| Compra R$ 100 em 3 parcelas | R$ 1.000 | R$ 100 | R$ 100 |
| Pagamento da primeira parcela R$ 33,34 | R$ 966,66 | R$ 100 | R$ 66,66 |

A compra reconhece a despesa integral em sua data e o passivo no ledger. O pagamento troca caixa por redução de passivo e não vira segunda despesa. O limite comprometido inclui todas as parcelas futuras. O gráfico foi nomeado Receitas e despesas e informa base de competência; não representa saídas bancárias puras.

Parcelas usam divisão inteira com o resto distribuído nas primeiras parcelas. Fechamento inclui a data civil do dia escolhido; compra no dia seguinte entra no ciclo seguinte. Dias 29–31 ajustam ao fim do mês sem perder a âncora para meses posteriores. O vencimento deve ser estritamente posterior ao fechamento, inclusive em fevereiro e quando os dois dias são ajustados.

Fechamento é uma ação explícita disponível a partir da data de fechamento. Ao fechar no próprio dia, o usuário impede novas inclusões nesse ciclo, mesmo que ainda existam horas restantes no dia. Importações de compras antigas são aceitas enquanto o ciclo ainda não foi explicitamente fechado. Pagar exige fatura fechada, conta ativa e valor até o restante. Sem juros, rotativo, multa ou desconto automático.

Antecipação move as primeiras parcelas futuras de faturas abertas para a fatura aberta escolhida; não altera valor total, despesa ou passivo. Compras podem ser canceladas integralmente antes de qualquer fatura vinculada estar fechada/paga. O cancelamento gera evento inverso, libera limite, exclui parcelas da cobrança e mantém os registros originais. Cancelamento após fechamento/pagamento, estorno de pagamento de fatura e reembolsos parciais não são suportados nesta etapa e são bloqueados.

Compromissos são agendamentos, sem efeito no saldo. Liquidar cria uma transação de receita/despesa por RPC atômica e vincula o compromisso ao evento. O mesmo compromisso não pode ser liquidado duas vezes, mesmo com chaves distintas. Estornar esse evento pelo módulo de movimentações reabre o compromisso; o histórico permanece.

## Recorrências e execução no backend

Cadência mensal ou anual, âncora do primeiro vencimento, horizonte de 12 meses à frente da data financeira atual. Começo permitido no máximo 12 meses atrás ou à frente; isso evita gerar acidentalmente décadas de ocorrências. O horizonte é inclusivo, não uma promessa de exatamente 12 ocorrências. Fevereiro ajusta o dia, mas março retorna ao dia original. UNIQUE(rule_id, competência) e cursor atualizado na mesma transação impedem duplicidade. Cancelar uma ocorrência não apaga a regra e não a recria no mesmo mês; cancelar a regra preserva pagamentos e vencimentos passados, cancelando apenas pendências de hoje em diante.

Novas regras materializam o horizonte no servidor imediatamente. O botão Atualizar agenda estende o horizonte de forma explícita. Para manutenção sem navegador aberto, `supabase/optional/enable-recurring-cron.sql` prepara um job diário que chama uma função privada. Esse arquivo é separado e **não é ativado pela migration principal**. Não há pagamentos automáticos, e-mail ou push. A execução real do scheduler ainda precisa ser validada no projeto Supabase após autorização. O job usa o pg_cron do próprio banco, conforme a [documentação oficial](https://supabase.com/docs/guides/cron).

## Banco e compatibilidade

Novas tabelas: cards, card_purchases, card_statements, card_installments, statement_payments, recurring_rules e bills. Todas têm RLS e leitura por membership; nenhuma aceita escrita direta de anon/authenticated. FKs compostas mantêm o isolamento entre tenants. O ledger admite passivo vinculado ao cartão; os eventos financeiros e pagamentos são imutáveis. As operações usam o mesmo lock do workspace da fase 2, mantendo uma ordem de serialização para compra, pagamento, estorno e transferência. Idempotência compara ator e payload dentro desse lock.

`read_finai_credit_snapshot` lê valores, parcelas e reversões numa única instrução SQL/MVCC. Centavos são serializados como strings e validados/conversão segura antes de chegar à interface. Se somente essa nova RPC estiver ausente (PGRST202), a aplicação usa a leitura da fase 2 e mantém contas e movimentações acessíveis, exibindo a atualização pendente apenas nos módulos novos. Erros de autorização ou leitura não são mascarados por esse fallback.

## Atualização do projeto existente

1. Revisar `supabase/update-phase-3.sql` e confirmar o projeto de destino e backup disponível.
2. Aplicar **somente esse arquivo incremental**, uma única vez, no projeto que já recebeu a fase 2. Não executar novamente `setup-finai.sql`.
3. O bundle é gerado por `node scripts/prepare-phase-3.mjs` a partir das migrations 004–008, numa única transação. Se houver erro, nenhum dos cinco arquivos fica aplicado parcialmente pelo bundle. Não remove contas, transações ou usuários existentes.
4. Recarregar o FinAI e testar com valores pequenos: cartão, compra, parcelas, fechamento e pagamento. Confirmar redução correta no saldo e no passivo, sem segunda despesa.
5. Job recorrente é ativação separada, opcional e sujeita a autorização. Registrar aplicações feitas pelo SQL Editor; reconciliar histórico antes de usar CLI db push no futuro.

Migrations executáveis: `202611100004_credit_schema.sql`, `202611100005_credit_commands.sql`, `202611100006_bills_commands.sql`, `202611100007_credit_snapshot.sql`, `202611100008_cancellations.sql`. As migrations da fase 2 e o bundle original não foram modificados.

## Verificação e limites

Testes de domínio/PostgreSQL local cobrem arredondamento, fechamento inclusivo, virada de ano, fevereiro/ano bissexto, pagamento parcial/total, limite excedido, idempotência e conflito de payload, conta/cartão de outro tenant, proibição de anônimo, cancelamentos, recorrências únicas e auditoria. Testes de leitura cobrem fallback estrito e proteção contra perda de precisão. O PostgreSQL local em WASM testa SQL e RLS com identidades simuladas; não substitui validação de JWTs reais nem testes de concorrência com conexões independentes no Supabase.

Resultado local: 52 testes Vitest aprovados e 12 testes Playwright aprovados em desktop/mobile; build de produção e tipagem aprovados. O teste de upgrade executou o bundle sobre dados anteriores e verificou preservação de saldo/histórico. Outro teste provocou colisão de objeto e confirmou rollback integral, inclusive das constraints alteradas. O navegador verificou cartões, distribuição de centavos na prévia, vencimento, agenda, filtros, recorrência anual e ausência de overflow horizontal; capturas desktop/mobile foram inspecionadas. Nenhum login remoto bem-sucedido ou gravação real de cartão é declarado validado por esses testes.

Nenhuma migration remota, job, serviço pago, IA real ou deploy foi executado nesta fase local. Ativação e testes com o usuário autenticado no projeto remoto permanecem pendentes. Não foram feitos commits ou pushes desta fase automaticamente.

## Arquivos alterados/criados

- Domínio e apresentação: `features/credit/domain.ts`, `credit-panel.tsx`, `upcoming.tsx`, `features/dashboard/dashboard.tsx`, `features/finance/live-controls.tsx`, `app/globals.css`.
- Tipos e dados: `types/credit.ts`, `types/snapshot.ts`, `types/finance.ts`, `services/mock-credit.ts`, `services/mock-finance.ts`.
- Backend: `server/finance/credit-actions.ts`, `credit-wire.ts`, `snapshot.ts`.
- Banco: migrations 004–008, `supabase/update-phase-3.sql`, `supabase/optional/enable-recurring-cron.sql`, `scripts/prepare-phase-3.mjs`.
- Testes: `tests/credit.test.ts`, `credit-database.test.ts`, `snapshot.test.ts`, `upgrade.test.ts`, `tests/e2e/credit.spec.ts`, ajuste dos fixtures esperados em `tests/e2e/dashboard.spec.ts`.
- Documentação: este documento, README principal e README de migrations.
