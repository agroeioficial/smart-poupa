// Regras da Fase 2 (depósitos) para a interface. A base de dados aplica as mesmas regras
// (submit_deposit, review_deposit, reverse_deposit); manter ambos em sincronia.
import type { GroupRole } from "./roles";

export type PaymentChannel = "mpesa" | "emola" | "mkesh" | "banco";
export type DepositStatus = "pendente" | "aprovado" | "rejeitado";

export const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  mpesa: "M-Pesa",
  emola: "e-Mola",
  mkesh: "mKesh",
  banco: "Transferência bancária",
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

export const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

/** Só o Diretor e o Tesoureiro validam depósitos, fazem estornos e veem as finanças do grupo. */
export function canManageFinance(roles: GroupRole[]) {
  return roles.includes("diretor") || roles.includes("tesoureiro");
}

/** Converte o valor escrito (aceita vírgula) em MZN; null se inválido (> 0, até 2 casas decimais). */
export function parseAmount(input: string): number | null {
  const t = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100_000_000 ? n : null;
}

export function receiptProblem(file: { type: string; size: number } | null): string | null {
  if (!file) return "Anexe o comprovativo (PDF ou imagem).";
  if (!RECEIPT_TYPES.includes(file.type)) return "O comprovativo deve ser PDF, JPG, PNG ou WEBP.";
  if (file.size > RECEIPT_MAX_BYTES) return "O comprovativo não pode ter mais de 5 MB.";
  return null;
}

/**
 * Quem decide não pode ser o beneficiário nem quem submeteu, salvo se for o único Diretor/Tesoureiro ativo
 * (igual a _check_not_self_finance na base de dados).
 */
export function canDecideOnDeposit(opts: { isMine: boolean; otherFinanceAdmins: number }) {
  return !opts.isMine || opts.otherFinanceAdmins === 0;
}

const mzn = new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatMZN(value: number | string | null | undefined) {
  return `${mzn.format(Number(value ?? 0))} MT`;
}

export function daysSince(iso: string, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}
