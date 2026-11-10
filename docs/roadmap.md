# Etapas e critérios de aceite

Cada fase depende de autorização explícita após a entrega anterior. Serviços pagos, chamadas reais de IA, migrations remotas, commits e deploy exigem autorização específica.

| Fase | Entrega | Critério de aceite |
| --- | --- | --- |
| 1 — Fundação local | arquitetura, plano do schema, dashboard responsivo, fixtures, formulário e testes iniciais | build e tipagem válidos; testes monetários e fluxo de lançamento; mocks identificados; nenhum segredo ou serviço ativo |
| 2 — Identidade e contas | Supabase local, Auth sem cadastro público, workspaces, migrations e RLS; contas, lançamentos, transferências e estornos | dois usuários/tenants isolados em testes reais; replay idempotente; concorrência; saldo derivado; auditoria imutável |
| 3 — Cartões e compromissos | compras, parcelas, faturas, pagamentos parciais, recorrências e assinaturas | soma de parcelas exata, virada de mês/ano e fevereiro, fechamento inclusivo, sem dupla contagem, retry concorrente sem duplicidade |
| 4 — Metas e relatórios | reservas, projeções, CSV/PDF e filtros por workspace | metas não duplicam saldo; projeções identificadas; exportação respeita autorização e previne CSV injection |
| 5 — Documentos e IA textual | upload privado, propostas de extração, duplicidade, chat com ferramentas de leitura | MIME falso/arquivo excessivo rejeitado; saída inválida/timeout/injection controlados; confirmação obrigatória; testes sem créditos reais |
| 6 — Áudio e voz | captura, transcrição, múltiplas propostas e síntese com cancelamento | permissão negada e provider failure tratados; nenhum lançamento automático; controle de voz e reprodução |
| 7 — PWA e operação | instalação, shell offline, jobs, alertas, backup, observabilidade, preparação de deploy | nenhum dado privado em cache; jobs funcionam sem browser; restauração testada; mobile e acessibilidade revisados; custos e limites aprovados |

## Testes exigidos antes de dados reais

Unitários: dinheiro, agregados, parcelas, datas de fechamento e recorrências.
Integração PostgreSQL: atomicidade, locks, duplicidade, idempotência com payload divergente, RLS e FK cruzadas, estornos e pagamento concorrente.
E2E: sessão, confirmação, cancelamento, busca, filtros, uploads inválidos, responsividade 390px e navegação por teclado.
IA sempre com mocks em CI; testes reais dependem de autorização e limite de gasto.
