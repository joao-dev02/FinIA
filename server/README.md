# Backend reservado

`finance/actions.ts` valida comandos com Zod e sessão com `getUser()`, então chama uma RPC financeira por operação. A chave publicável usa a sessão do usuário; nenhuma chave que ignore RLS é necessária. As RPCs validam membership e regras novamente, pois podem ser chamadas fora da interface. `finance/snapshot.ts` usa uma RPC SQL de leitura consistente, sem armazenar dados privados em cache global. A gravação nunca depende de texto de IA.
