# Fase 3 — Empréstimos: pedidos e aprovação da direção (23/11/2026)

## Âmbito desta etapa
Pedido de empréstimo pelo membro, votação da direção, regras de empréstimo por grupo. O desembolso, o plano de
prestações, os juros calculados e as dívidas ficam para a etapa seguinte da Fase 3.

## Regras (decisões da AGROEI de 23/11)
- O membro indica valor (MZN), prazo em meses, finalidade, garantia e anexa a declaração de dívida e compromisso assinada (sempre obrigatória).
- Aprovação igual à da suspensão, contando a direção ativa sem quem pede: 1 decide sozinho; 2 aprovam os dois; 3 ou mais bastam 3 aprovações que incluam Diretor, Tesoureiro e Secretário. Uma rejeição rejeita e o membro vê o motivo.
- Prazo de votação, garantia obrigatória ou opcional e juros (método e taxa): cada grupo define nas Definições (só o Diretor). O prazo é só um aviso.
- O pedido guarda os juros em vigor no momento do envio.
- Estados: Submetido → Em análise → Aprovado / Rejeitado; Cancelado pelo próprio antes da decisão.

## Tabelas e segurança
- `loans`, `loan_votes`, `group_loan_settings` com RLS: o membro vê os seus pedidos; a direção vê os pedidos e os votos; regras visíveis aos membros ativos. Outros grupos e a AGROEI não veem nada.
- Escrita só por funções seguras: `submit_loan_request`, `vote_loan`, `cancel_loan_request`, `set_group_loan_settings` (com registo na Atividade).
- Pedidos e votos não se apagam nem se alteram (triggers); documentos no bucket privado `comprovativos` (quem pediu, Diretor e Tesoureiro; o Secretário vota sem abrir os documentos).

## Testes
- `scripts/test-rls-fase3.ts`: 44/44 (inclui “duas aprovações não aprovam” e “rejeição não altera saldo”). Fase 1 91/91, Fase 2 45/45.
- `src/test/loans.test.ts`: 15 testes de regras; total da interface 47/47.
- Navegador: regras definidas pelo Diretor, pedido do membro, votos de Diretor e Tesoureiro (continua em análise), voto do Secretário (aprovado), membro vê “Aprovado”.

## Pendente para a AGROEI
- Empréstimos a não membros (padrinho) continuam por validar juridicamente.
- Multas, juros de mora e incumprimento (manual sec. 17).
- Distribuição dos juros entre membros (manual sec. 8.3).
