# Modelo de dados proposto — ainda não aplicado

## Entidades

Todos os registros financeiros incluem id UUID, workspace_id, created_at timestamptz e created_by UUID. Valores: BIGINT em centavos. Datas financeiras: DATE; instantes de auditoria: timestamptz. Moeda BRL na versão inicial; nunca somar moedas distintas.

| Entidade | Campos e relações principais |
| --- | --- |
| profiles | id FK auth.users, nome, timezone |
| workspaces | id, nome, owner_id, moeda, timezone America/Fortaleza |
| workspace_members | workspace_id + user_id únicos, role owner/editor/viewer |
| accounts | workspace_id, nome, tipo, archived_at; saldo inicial como evento de abertura |
| categories | workspace_id, nome, natureza, parent_id opcional |
| financial_events | tipo, effective_date, competência, idempotency_key, payload_hash, reversal_of |
| ledger_entries | event_id, account_id ou liability_id, valor assinado; soma zero por evento com contas de contrapartida |
| transactions | event_id, descrição, categoria, natureza receita/despesa; projeção para relatórios |
| transfers | event_id, origem, destino, amount_cents positivo; origem diferente de destino |
| cards | workspace_id, conta passivo, limite, closing_day, due_day, archived_at |
| purchases | card_id, merchant, total_cents, purchased_on, installment_count |
| installments | purchase_id, número único por compra, amount_cents, statement_id, competência |
| statements | card_id, cycle_start, cycle_end, closing_on, due_on, status; ciclo único por cartão |
| statement_payments | statement_id, event_id, amount_cents; pagamento parcial permitido |
| recurring_rules | frequência, start_on, end_on, dia, timezone, next_run, versão |
| recurring_occurrences | rule_id + competência únicos, event_id ou compromisso pendente |
| bills | natureza pagar/receber, due_on, amount_cents, status, settlement_event_id |
| goals | target_cents, deadline, nome, archived_at |
| goal_contributions | goal_id, account_id, amount_cents; reserva contábil sem nova receita |
| attachments | bucket/path privado, sha256, MIME validado, tamanho, event_id opcional |
| document_extractions | attachment_id, status, schema_version, dados validados e incertezas |
| notifications | user_id, entidade, tipo, scheduled_at, read_at, dedup_key única |
| ai_messages | usuário/workspace, papel, conteúdo minimizado, ferramenta e período |
| ai_usage | provedor, recurso, unidades, custo estimado, limite diário |
| audit_events | ator, evento, entidade, versão anterior/nova minimizada, request_id; append-only |
| idempotency_records | workspace_id + operação + chave únicos, hash de payload, resposta |

## Integridade e autorização

- Índice UNIQUE(workspace_id, id) nas entidades referenciadas; FK(workspace_id, account_id) impede referência cruzada mesmo com UUID válido. Aplicar também a cartões, categorias, faturas, metas, anexos e eventos.
- RLS habilitada em todas as tabelas de tenant. SELECT com membership; mutações exigem editor/owner. Auditoria e ledger não aceitam mutações diretas do cliente. Grants mínimos; funções financeiras com search_path fixo e verificação interna de auth.uid().
- Storage privado com política de membership e vínculo com metadados. Nenhum bucket público. Sem service_role no frontend.
- Consulta de membership sem recursão de política; helpers security definer restritos, schema qualificado e testes contra escalada de role.

## Operações atômicas planejadas

Transferência: validar ator, contas, moeda e centavos; adquirir locks em ordem de UUID; resolver chave idempotente; gravar evento e duas pernas, auditoria e resposta na mesma transação. Transferência não gera receita/despesa.

Compra de cartão: aumentar passivo e reconhecer despesa por política de competência definida (compra integral no patrimônio, parcelas na projeção mensal). Pagamento reduz caixa e passivo, sem nova despesa. Relatórios devem explicitar base caixa/competência e nunca combinar bases silenciosamente. Limite considera passivo pendente incluindo parcelas futuras. Reembolsos são eventos vinculados à compra.

Parcelamento: quociente inteiro + um centavo nas primeiras parcelas até consumir resto; soma exata. Faturas consideram fechamento inclusivo em data civil; compra no dia seguinte vai para o próximo ciclo. Dia 29–31 ajusta ao último dia do mês. Pagamento e fechamento bloqueiam a fatura; soma de pagamentos não ultrapassa dívida, salvo política explícita futura de crédito.

Recorrência: UNIQUE(rule_id, competência), insert on conflict controlado e atualização do cursor na mesma transação. Retry não duplica. Edição de regra não altera ocorrências liquidadas.

Estorno: registrar inverso vinculado ao original, nunca apagar lançamento liquidado; UNIQUE(reversal_of) quando estorno integral. Edição com optimistic version; após liquidação usar estorno/substituição. Reservas de metas alocam saldo existente, não aumentam patrimônio; evitar reserva acima do saldo disponível sob lock.

Idempotência: mesma chave e mesmo hash devolvem mesma resposta; mesma chave com payload diferente é conflito. Unique constraint deve arbitrar chamadas concorrentes. Notificações e webhooks usam chaves persistentes; verificar assinatura e timestamp no servidor.

## Sequência de migrations futura

001 profiles/workspaces/membership e helpers RLS; 002 contas/categorias; 003 ledger/transações/transferências/idempotência/auditoria; 004 cartões/faturas/parcelas; 005 compromissos/recorrências; 006 metas/reservas; 007 anexos/Storage/extrações; 008 IA/uso/notificações. Toda migration requer testes locais, revisão e plano de recuperação. Nenhuma migration remota autorizada nesta fase.
