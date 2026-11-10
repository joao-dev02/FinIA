# Arquitetura

## Decisões

Next.js App Router com TypeScript; React para interface; Tailwind e componentes locais com primitivas Radix compatíveis com a abordagem shadcn/ui; Framer Motion para entrada discreta dos cards; Recharts para visualização; React Hook Form para estado de formulário e Zod no domínio para validação. Fontes do sistema nesta etapa, sem download de fontes em tempo de build. Geist/Montserrat locais podem ser adicionadas posteriormente.

Somente a fase visual usa estado em memória. Não há backend financeiro ativo. Os filtros e cálculos do navegador não oferecem autorização: RLS e validação no servidor são condições para dados reais.

```text
app/                  rotas, layout e estilos
components/ui/        componentes visuais reutilizáveis
features/dashboard/   composição da experiência demonstrativa
features/finance/     funções puras e schemas monetários
lib/                  utilitários técnicos
services/ai/          contrato de provedor e implementação simulada
services/             fixtures de demonstração
server/               contratos e limites do futuro backend
hooks/                reservado para hooks compartilhados quando necessários
types/                tipos de domínio
tests/                testes unitários e e2e
supabase/migrations/  migrations versionadas futuras
docs/                 decisões, schema e critérios de aceite
```

## Fluxo de produção planejado

Interface → sessão Supabase validada no servidor → comando Zod → verificação de membership → operação SQL atômica → ledger e auditoria → resposta tipada. Nunca confiar em workspace enviado pelo cliente sem autorização. Chaves de serviço somente no servidor, jamais em variáveis NEXT_PUBLIC.

Monólito modular: domínio financeiro separado da apresentação e da infraestrutura; Supabase PostgreSQL/Auth/Storage no backend; deploy Vercel apenas após autorização. Worker agendado ou cron autenticado para recorrências e alertas; navegador fechado não impede execução. Provedor de IA recebe somente agregados ou documentos estritamente necessários.

## Contratos de IA futuros

Separar TextInterpreter, VisionExtractor, Transcriber e SpeechSynthesizer. Todos com AbortSignal, timeout, schemas de resposta, orçamento por usuário/dia e erros tipados. Não existe chamada real nesta entrega. Implementar ferramentas de leitura enumeradas: get_financial_summary, get_transactions, get_account_balances, get_upcoming_bills, get_card_statements, get_category_spending, get_financial_goals, simulate_cash_flow. Rejeitar SQL ou nome de ferramenta arbitrário.

Documentos e mensagens são entrada não confiável. Extração cria proposta, nunca lançamento. Proposta inclui campos ausentes como null, incertezas, tipo de documento e status de pagamento. Confirmação explícita associa hash da proposta, usuário, expiração e chave idempotente; mudança de dados invalida confirmação. Múltiplos lançamentos de áudio exigem revisão individual ou lote explicitamente confirmado.

Uploads futuros: validar assinatura do arquivo além do MIME/extensão, tamanho e páginas; limitar decodificação e proteger contra arquivos maliciosos; bucket privado, URL assinada curta, hash para detectar duplicidade, retenção e exclusão documentadas. Não registrar documento, prompt ou números sensíveis nos logs.

## Riscos críticos

1. Vazamento entre workspaces: FK compostas, RLS e testes com dois JWTs reais antes de liberar backend.
2. Duplicidade/concorrência: constraints, locks ordenados e idempotência no banco, não apenas botões desabilitados.
3. Dupla contagem de cartão: competência de compra e pagamento de passivo são eventos distintos.
4. Erro temporal: datas civis em DATE; instantes em timestamptz; competência e jobs em America/Fortaleza. A demonstração usa novembro de 2026 fixo.
5. Precisão: BIGINT no PostgreSQL; centavos no JS só no intervalo seguro. Valores fora do intervalo devem usar string/BigInt no adaptador.
6. Custos e indisponibilidade de IA: limites persistidos antes da chamada, timeout, mocks em testes e fallback determinístico.
7. PWA: cache apenas shell/ativos; nunca respostas autenticadas ou comprovantes. Instalação e offline ficam para fase própria.
8. Backup: definir RPO/RTO, retenção, exportação criptografada e teste de restauração em ambiente separado antes de produção; backup do banco não substitui backup do Storage.

## Documentação consultada

- https://nextjs.org/docs/app/getting-started/installation
- https://tailwindcss.com/docs/installation/framework-guides/nextjs
- https://vitest.dev/guide/
- https://react-hook-form.com/get-started
- https://zod.dev/basics
- https://www.radix-ui.com/primitives/docs/overview/introduction
- https://motion.dev/docs/react-installation
- https://recharts.github.io/en-US/guide/

Os pacotes foram resolvidos a partir da tag estável do registry e fixados com versão exata e lockfile após instalação. Next.js 16.4.5, React 19.3.1, Tailwind 4.3.5, Zod 4.6.7 e Vitest 5.1.0 passaram pelos checks locais; nenhuma versão canary foi selecionada. A configuração manual dos componentes segue https://ui.shadcn.com/docs/installation/manual, com Button adaptado à identidade do projeto.
