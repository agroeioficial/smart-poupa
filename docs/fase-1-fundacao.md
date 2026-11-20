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

## Decisões da AGROEI aplicadas (18–20/11/2026)
1. Dados sensíveis: Diretor, Secretário e Tesoureiro (o Tesoureiro só consulta).
2. Cadastro: nome, contacto, email, profissão, documento (tipo e número), data de nascimento e morada são obrigatórios.
3. Suspensão, exclusão, reativação e promoção a administrador: pedido de qualquer administrador com motivo; 1 administrador decide sozinho, 2 aprovam os dois, 3 ou mais aprovam o Diretor, o Tesoureiro e o Secretário; uma rejeição encerra o pedido.
4. Lista de membros começa desativada em cada grupo.
5. Histórico da direção visível a todos os membros do grupo (separador "Direção").
6. Ninguém cria conta: a direção cadastra e o convite segue por email; o link aceita o convite e pede só a palavra-passe.
7. A AGROEI não vê "Os meus grupos"; quem pertence a um só grupo entra direto nele.

## Pendente (ação da AGROEI no Supabase)
- Configurar um servidor de email próprio (SMTP) — o envio incluído no Supabase é muito limitado (poucos emails por hora).
- Autorizar os endereços da aplicação para convites (`/convite`) e desativar o registo público de contas.
- Substituição de administradores ausentes (secção 17) — regras de prazo ainda por definir.
