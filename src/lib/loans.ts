// Regras da Fase 3 (pedidos de empréstimo e votação da direção) para a interface.
// A base de dados aplica as mesmas regras (submit_loan_request, vote_loan, _loan_vote_state); manter em sincronia.
import { approvalProgress, isAdmin, type GroupRole } from "./roles";

export type LoanStatus =
  | "submetido"
  | "em_analise"
  | "aprovado"
  | "rejeitado"
  | "cancelado"
  | "desembolsado"
  | "em_pagamento"
  | "liquidado"
  | "em_incumprimento";

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  submetido: "Submetido",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  desembolsado: "Desembolsado",
  em_pagamento: "Em pagamento",
  liquidado: "Liquidado",
  em_incumprimento: "Em incumprimento",
};

export type InterestMethod = "fixa_unica" | "simples_mensal" | "sobre_saldo";

export const INTEREST_METHOD_LABEL: Record<InterestMethod, string> = {
  fixa_unica: "Percentagem fixa única",
  simples_mensal: "Juro simples mensal",
  sobre_saldo: "Juro mensal sobre o que falta pagar",
};

export const INTEREST_METHOD_HINT: Record<InterestMethod, string> = {
  fixa_unica: "A taxa aplica-se uma vez sobre o valor emprestado.",
  simples_mensal: "A taxa aplica-se todos os meses sobre o valor inicial.",
  sobre_saldo: "A taxa aplica-se todos os meses sobre o capital ainda em dívida.",
};

export function isOpenLoan(status: LoanStatus) {
  return status === "submetido" || status === "em_analise";
}

/** Prazo do pedido em meses: inteiro de 1 a 120. */
export function parseTerm(input: string): number | null {
  const t = input.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 120 ? n : null;
}

/** Taxa de juros do grupo: 0 a 100 %, até 2 casas decimais (aceita vírgula). */
export function parseRate(input: string): number | null {
  const t = input.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 100 ? n : null;
}

export function loanRequestProblem(v: {
  amount: number | null;
  term: number | null;
  purpose: string;
  declaration: boolean;
  guaranteeRequired: boolean;
  guaranteeDescription: string;
  guaranteeFile: boolean;
}): string | null {
  if (v.amount === null) return "Indique um valor válido em MZN (até 2 casas decimais).";
  if (v.term === null) return "Indique o prazo em meses (de 1 a 120).";
  const p = v.purpose.trim().length;
  if (p < 5 || p > 1000) return "Descreva a finalidade (entre 5 e 1000 caracteres).";
  if (!v.declaration) return "Anexe a declaração de dívida e compromisso assinada.";
  if (v.guaranteeRequired && (!v.guaranteeDescription.trim() || !v.guaranteeFile))
    return "Este grupo exige garantia: descreva-a e anexe o documento ou fotografia.";
  return null;
}

/**
 * Votação do pedido (igual a _loan_vote_state na base de dados): a direção ativa conta-se sem o requerente,
 * com a mesma regra da suspensão — 1 → basta 1; 2 → os 2; 3 ou mais → 3 aprovações que cubram
 * Diretor, Tesoureiro e Secretário. Uma rejeição rejeita.
 */
export function loanApproval(opts: {
  board: { memberId: string; roles: GroupRole[] }[];
  borrowerMemberId: string;
  votes: { memberId: string; vote: "aprovado" | "rejeitado" }[];
}) {
  const eligible = opts.board.filter((b) => b.memberId !== opts.borrowerMemberId && isAdmin(b.roles));
  const progress = approvalProgress({
    eligible,
    approvals: opts.votes.filter((v) => v.vote === "aprovado").map((v) => v.memberId),
    rejected: opts.votes.some((v) => v.vote === "rejeitado"),
  });
  return { ...progress, eligible };
}

/** Só a direção vota, nunca no próprio pedido, uma só vez e enquanto o pedido está aberto. */
export function canVoteOnLoan(opts: {
  myRoles: GroupRole[];
  myMemberId: string | null;
  borrowerMemberId: string;
  status: LoanStatus;
  alreadyVoted: boolean;
}) {
  return (
    isAdmin(opts.myRoles) &&
    !!opts.myMemberId &&
    opts.myMemberId !== opts.borrowerMemberId &&
    isOpenLoan(opts.status) &&
    !opts.alreadyVoted
  );
}

/** Prazo de votação definido pelo grupo: só um aviso, o pedido continua aberto. */
export function voteDeadlinePassed(createdAt: string, deadlineDays: number | null, now = new Date()) {
  if (!deadlineDays) return false;
  return now.getTime() - new Date(createdAt).getTime() > deadlineDays * 86_400_000;
}

/** Os documentos do pedido só abrem para quem pediu, o Diretor e o Tesoureiro (o Secretário vota sem os ver). */
export function canOpenLoanDocuments(opts: { myRoles: GroupRole[]; isMine: boolean }) {
  return opts.isMine || opts.myRoles.includes("diretor") || opts.myRoles.includes("tesoureiro");
}
