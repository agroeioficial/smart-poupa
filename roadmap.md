# SMART POUPA — Roadmap

## Fase 1 — Fundação (concluída, a aguardar validação da AGROEI)
- [x] Base de dados multi-grupo com RLS (grupos, membros, papéis, dados privados, auditoria)
- [x] Testes de isolamento entre grupos e permissões
- [x] Proprietário AGROEI: agroeioficial@gmail.com
- [x] Autenticação (entrar, criar conta, recuperar palavra-passe)
- [x] Painel do utilizador, convites e área AGROEI
- [x] Área do grupo: início, membros, definições, atividade
- [x] Usar o ícone oficial SMART POUPA (logótipo, favicon e ícone da app instalada)
- [x] Testes de regras e verificação visual

## Fase 1 — Decisões da AGROEI (18/11)
- [x] Cadastro com todos os campos obrigatórios (base de dados)
- [x] Suspensão/exclusão com aprovação da direção (base de dados)
- [x] Histórico da direção visível a todos os membros (base de dados)
- [x] Tesoureiro vê dados sensíveis (só leitura)
- [x] Promoção a administrador por proposta com aprovação da direção (mesma regra)
- [x] Reativação com aprovação da direção
- [x] Páginas: cadastro obrigatório, pedidos e votos, separador Direção
- [x] Testes atualizados (72/72 na base de dados)

## Pedido de 20/11
- [x] Reaplicar correção da contagem de aprovações
- [x] AGROEI sem "Os meus grupos"; membro de um só grupo entra direto
- [x] Convite por email ao cadastrar; link aceita e pede só a palavra-passe; sem criar conta
- [ ] Envio real de emails: falta configurar o servidor de email (SMTP) e os endereços autorizados no Supabase (ação da AGROEI)

## Governança de membros (21/11)
- [x] Beneficiário confidencial por morte + histórico
- [x] Admissão com aprovação unânime (estado "A aguardar aprovação", ecrã de espera, aviso aos membros)
- [x] Perfis coletivos (uma cota) na lista de membros
- [x] Testes de segurança atualizados (91/91)

## Fase 2 — Depósitos e comprovativos (22/11)
- [x] Contas/carteiras do grupo (M-Pesa, e-Mola, mKesh, banco)
- [x] Submissão de depósito (individual ou perfil coletivo) com referência e comprovativo
- [x] Validação/rejeição por Tesoureiro ou Diretor; saldo só após aprovação
- [x] Estornos documentados; registos imutáveis e auditados
- [x] Testes de segurança (45/45 na base de dados; Fase 1 continua 91/91) e de interface
- [x] Decisões: sem prazo de validação; estorno por Tesoureiro ou Diretor

## Próximas fases (não iniciar sem pedido)
- Fase 3 — Empréstimos · Fase 4 — Administração · Fase 5 — SaaS AGROEI · Fase 6 — Exportação e PWA (ícones da app instalada já preparados)
