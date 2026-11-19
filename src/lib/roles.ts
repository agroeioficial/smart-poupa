// Regras de papéis e estados da Fase 1 (Manual Mestre, secções 4 e 9, e decisões da AGROEI de 18/11/2026).
// A segurança real está nas políticas RLS e funções da base de dados; isto só decide o que a interface mostra.

export type GroupRole = "diretor" | "tesoureiro" | "secretario" | "membro";
export type MemberStatus = "convidado" | "ativo" | "suspenso" | "excluido";
export type RequestState = "pendente" | "aprovado" | "rejeitado" | "cancelado";

export const ROLE_LABEL: Record<GroupRole, string> = {
  diretor: "Diretor",
  tesoureiro: "Tesoureiro",
  secretario: "Secretário",
  membro: "Membro",
};

export const STATUS_LABEL: Record<MemberStatus, string> = {
  convidado: "Convidado",
  ativo: "Ativo",
  suspenso: "Suspenso",
  excluido: "Excluído",
};

export const ALL_ROLES: GroupRole[] = ["diretor", "tesoureiro", "secretario", "membro"];
export const ADMIN_ROLES: GroupRole[] = ["diretor", "tesoureiro", "secretario"];

export function isAdmin(roles: GroupRole[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

/** Diretor e Secretário cadastram e editam membros. */
export function canManageMembers(roles: GroupRole[]) {
  return roles.includes("diretor") || roles.includes("secretario");
}

/** Diretor, Tesoureiro e Secretário veem os dados sensíveis (o Tesoureiro só lê). */
export function canSeePrivateData(roles: GroupRole[]) {
  return isAdmin(roles);
}

export function canEditSettings(roles: GroupRole[]) {
  return roles.includes("diretor");
}

/** Pedidos de suspensão, exclusão ou reativação que o utilizador pode abrir (precisam de aprovação da direção). */
export function allowedStatusRequests(opts: {
  myRoles: GroupRole[];
  targetStatus: MemberStatus;
  isSelf: boolean;
}): MemberStatus[] {
  const { myRoles, targetStatus, isSelf } = opts;
  if (isSelf || !isAdmin(myRoles) || targetStatus === "excluido") return [];
  if (targetStatus === "suspenso") return ["ativo", "excluido"];
  return ["suspenso", "excluido"];
}

/** Qualquer administrador propõe cargos para outra pessoa ativa ou convidada. */
export function canProposeRoles(opts: { myRoles: GroupRole[]; targetStatus: MemberStatus; isSelf: boolean }) {
  return !opts.isSelf && isAdmin(opts.myRoles) && (opts.targetStatus === "ativo" || opts.targetStatus === "convidado");
}

/**
 * Regra de aprovação da direção (igual à função _status_request_state da base de dados):
 * conta-se a direção ativa sem a pessoa visada; 1 → basta 1; 2 → os 2; 3 ou mais → 3 aprovações
 * que cubram cada cargo principal (Diretor, Tesoureiro, Secretário) ocupado. Uma rejeição rejeita.
 */
export function approvalProgress(opts: {
  eligible: { memberId: string; roles: GroupRole[] }[];
  approvals: string[];
  rejected: boolean;
}) {
  const { eligible, rejected } = opts;
  const ids = new Set(eligible.map((e) => e.memberId));
  const approvers = eligible.filter((e) => opts.approvals.includes(e.memberId));
  const need = Math.min(eligible.length, 3);
  const missingRoles: GroupRole[] =
    eligible.length >= 3
      ? ADMIN_ROLES.filter(
          (role) => eligible.some((e) => e.roles.includes(role)) && !approvers.some((a) => a.roles.includes(role)),
        )
      : [];
  const have = opts.approvals.filter((id) => ids.has(id)).length;
  const state: RequestState = rejected
    ? "rejeitado"
    : need > 0 && have >= need && missingRoles.length === 0
      ? "aprovado"
      : "pendente";
  return { state, need, have, missingRoles };
}

export type MemberRecord = {
  phone: string | null;
  profession: string | null;
  email?: string | null;
  id_document_type: string | null;
  id_document_number: string | null;
  birth_date: string | null;
  address: string | null;
};

/** Todos os campos do cadastro são obrigatórios (decisão da AGROEI). */
export function isRecordIncomplete(r: MemberRecord) {
  return [r.phone, r.profession, r.id_document_type, r.id_document_number, r.birth_date, r.address].some(
    (v) => !v || !String(v).trim(),
  );
}

export function sortRoles(roles: GroupRole[]) {
  return [...roles].sort((a, b) => ALL_ROLES.indexOf(a) - ALL_ROLES.indexOf(b));
}
