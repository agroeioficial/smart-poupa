# Fase 2 — Depósitos e comprovativos

## O que existe
- **Poupança** (todos os membros ativos): saldo confirmado e valor pendente (individual e, se aplicável, da cota coletiva), contas do grupo para depósito, submissão de depósito com referência e comprovativo, histórico dos próprios depósitos.
- **Depósitos** (Diretor e Tesoureiro): pendentes com comprovativo, aprovar/rejeitar com motivo, histórico com estornos, saldos por cota, gestão das contas do grupo.

## Tabelas e regras de acesso
| Tabela | Quem lê | Escrita |
|---|---|---|
| group_payment_accounts | membros ativos do grupo | `create_payment_account`, `set_payment_account_active` (Diretor/Tesoureiro); dados não editáveis, sem apagar |
| deposits | quem submeteu, o membro visado, integrantes do perfil coletivo, Diretor/Tesoureiro | `submit_deposit` (membro ativo), `review_deposit` (Diretor/Tesoureiro); decidido = imutável |
| savings_ledger | membro visado, integrantes do perfil, Diretor/Tesoureiro | criado por `review_deposit` e `reverse_deposit`; nunca alterado nem apagado |
| storage `comprovativos` | quem enviou, Diretor/Tesoureiro do grupo | envio só na própria pasta; sem substituir nem apagar |

Saldos: `my_savings` (próprio e cota coletiva) e `group_savings` (só Diretor/Tesoureiro).

## Testes
- `scripts/test-rls-fase2.ts`: 45/45 (isolamento, permissões, validações, imutabilidade, estornos, comprovativos).
- `scripts/test-rls-fase1.ts`: 91/91 (sem regressões).
- `src/test/finance.test.ts` + restantes testes de interface: 32/32.
- Navegador: membro submete para a cota coletiva → Tesoureiro aprova → estorna → integrante vê o histórico.

## Decisões da AGROEI (22/11/2026)
- Sem prazo de validação: o depósito fica pendente até ser conferido.
- Estorno: Tesoureiro ou Diretor, com motivo obrigatório.

## Pendentes
- Limites de comprovativos por plano (Manual, secções 10 e 17) — planos são da Fase 5.
- Fundo comum e despesas (secção 7.4) não fazem parte deste pedido.
- Regra assumida: ninguém decide sobre um depósito seu, salvo se for o único Diretor/Tesoureiro ativo.
