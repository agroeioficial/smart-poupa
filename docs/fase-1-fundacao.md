# SMART POUPA — Relatório da Fase 1 (Fundação)

Data: 18/11/2026 · Referência: Manual Mestre v1.0, secções 15 e 18.2

## Âmbito entregue
- Autenticação individual (entrar, criar conta, recuperar palavra-passe).
- Estrutura multi-grupo com `group_id` em todos os registos do grupo.
- Papéis: Proprietário AGROEI (plataforma); Diretor, Tesoureiro, Secretário e Membro (por grupo; uma pessoa pode acumular papéis num único registo).
- Estados de membro: Convidado → Ativo → Suspenso / Excluído (exclusão definitiva; nada é apagado).
- Cadastro, edição, pesquisa e listagem paginada de membros.
- Lista de membros visível aos membros apenas com nome, contacto e profissão, e só se o Diretor a ativar.
- Área AGROEI: criar grupos e atribuir o primeiro Diretor, sem acesso a membros ou dados pessoais.
- Histórico de atividade (só leitura) para o Diretor.
- Interface em português, responsiva, com o ícone oficial.

## Tabelas
| Tabela | Conteúdo |
| --- | --- |
| profiles | Nome e contacto da conta |
| platform_roles | Papel Proprietário AGROEI |
| platform_role_invites | Emails promovidos a AGROEI ao confirmar a conta (sem acesso pela aplicação) |
| groups | Nome, localidade, contactos oficiais, estado, opção "lista visível" |
| group_members | Nome, contacto, profissão, estado (dados partilháveis) |
| group_member_roles | Papéis por grupo |
| member_private_data | Email, documento, data de nascimento, morada (dados sensíveis) |
| audit_log | Quem fez o quê e quando |

## Regras de acesso (RLS)
- Leitura: cada pessoa só lê dados dos grupos onde está ativa (ou o nome do grupo que a convidou).
- Membros: o próprio registo; administradores veem todos do seu grupo; membros veem os ativos só com a lista ativada.
- Dados sensíveis: o próprio, Diretor e Secretário.
- Atividade: só o Diretor.
- AGROEI: lê grupos; não lê membros, dados sensíveis nem atividade.
- Escrita: nenhuma tabela aceita escrita direta; tudo passa por funções seguras que verificam o papel:
  `create_group` (AGROEI), `update_group_settings` (Diretor), `add_group_member` / `update_group_member` (Diretor, Secretário; papéis administrativos só pelo Diretor), `set_member_status` (Diretor; Secretário só para membros comuns; ninguém altera o próprio estado; mantém sempre um Diretor ativo), `set_member_roles` (Diretor), `accept_invitation` (o próprio).

## Testes executados
- `scripts/test-rls-fase1.ts` — 48/48 aprovados contra a base de dados real, com contas fictícias apagadas no fim. Inclui o critério da Fase 1: o Grupo B não vê nem altera nada do Grupo A, mesmo por chamadas diretas.
- `src/test/roles.test.ts` — 9 regras de permissões da interface.
- Teste no navegador: entrada, aceitar convite, cadastrar membro, definições, atividade, Área AGROEI (computador) e vista de membro (telemóvel).

## Decisões pendentes da AGROEI
1. Quem pode ver os dados sensíveis: hoje Diretor e Secretário (o manual diz que o Secretário gere o cadastro mas não vê "documentos sensíveis").
2. Campos obrigatórios do cadastro e se o documento de identificação deve ser recolhido.
3. Suspensão/exclusão: confirmar que o Secretário pode suspender membros comuns e que a exclusão é definitiva.
4. Lista de membros: começa desativada em cada grupo (opção do manual) — confirmar.
5. Substituição de administradores ausentes (secção 17).
6. Configuração do email de confirmação de conta e dos endereços autorizados no Supabase.
