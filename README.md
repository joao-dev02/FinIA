# FinAI

Sistema de gestão financeira pessoal, com tema azul e integração Supabase. A rota `/` usa autenticação e dados persistidos no Supabase configurado; `/demo` permanece isolada com dados fictícios e formulários de prévia. **Aplique as migrations revisadas e conclua a validação remota antes de usar dados reais.**

## Cartões e compromissos — fase 3

Cartões, compras à vista/parceladas, faturas, pagamentos parciais, antecipação, contas a pagar/receber e recorrências mensais/anuais estão implementados. Para atualizar o projeto existente da fase 2, revise e aplique **somente** `supabase/update-phase-3.sql`. Não repita o setup inicial. Enquanto a atualização não for aplicada, contas e movimentações anteriores continuam disponíveis.

Veja [regras e limites da fase 3](docs/phase-3.md). A compra do cartão conta como despesa integral; pagar fatura não duplica gastos. Recorrências criam compromissos pendentes, nunca débitos automáticos. O scheduler opcional tem ativação separada.

## Metas e relatórios — fase 4

Metas, reservas vinculadas às contas, simulação de prazo, relatórios comparativos e exportações CSV/PDF estão implementados localmente. Aplique `supabase/update-phase-4.sql` **após** a fase 3. Reservar não duplica saldo; movimentações que consumiriam uma reserva exigem sua liberação. Veja [regras, arquivos e limites da fase 4](docs/phase-4.md).

## Conectar seu espaço

1. Configure `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no `.env.local` (exemplo em `.env.example`). As variáveis são exclusivas do servidor. Não adicionar `service_role` ou chave secreta ao frontend.
2. Revise as três migrations em `supabase/migrations/`. A aplicação não as executa automaticamente. Aplicação remota depende de autorização e acesso administrativo apropriado.
3. No Supabase Auth, desative novos cadastros públicos e crie/convide o usuário proprietário. O login usa e-mail e senha de um usuário do Supabase Auth, não a senha administrativa do painel Supabase.
4. Abra `/login`. Após entrar, confirme **Criar meu espaço** e depois **Adicionar conta**. Informe o saldo inicial; ele não vira receita. Use os formulários de movimentação/transferência para confirmar cada operação.
5. Recarregue e confira a persistência antes de adicionar mais dados. Estornos e arquivamento preservam o histórico.

Veja [estado da fase 2 e limites de validação](docs/phase-2.md). Migrations devem ser aplicadas em ordem; nunca use reset em banco remoto existente.

## Executar

Requer Node.js 24 LTS (ou compatível com `engines` das dependências).

```powershell
npm install
npm run dev
```

Abra http://localhost:3000 para acesso pessoal ou http://localhost:3000/demo para demonstração. Após o primeiro install, use `npm ci` para reproduzir o lockfile.

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Se estiver usando o runtime portátil baixado durante a implementação:

```powershell
$env:Path = "$PWD\.tools\node-v24.22.2-win-x64;$env:Path"
npm.cmd run dev
```

## O que testar na demonstração (`/demo`)

- Alternar novembro/outubro e verificar estado vazio.
- Adicionar receita ou despesa, conferir saldo, resumo e tabela.
- Pesquisar movimentações; ocultar valores; gerar resumo simulado.
- Navegar por contas e relatórios e pelos módulos planejados.
- Recarregar para restaurar os dados fictícios.

Veja [arquitetura](docs/architecture.md), [modelo de dados](docs/data-model.md), [fases e aceite](docs/roadmap.md) e [validação da entrega](docs/phase-1.md).
