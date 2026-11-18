// Regras de papéis e estados da Fase 1 (Manual Mestre, secções 4 e 9).
// A segurança real está nas políticas RLS e funções da base de dados; isto só decide o que a interface mostra.

export type GroupRole = "diretor" | "tesoureiro" | "secretario" | "membro";
export type MemberStatus = "convidado" | "ativo" | "suspenso" | "excluido";

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

/** Diretor e Secretário gerem o cadastro e veem dados sensíveis. */
export function canManageMembers(roles: GroupRole[]) {
  return roles.includes("diretor") || roles.includes("secretario");
}

export function canAssignRoles(roles: GroupRole[]) {
  return roles.includes("diretor");
}

export function canEditSettings(roles: GroupRole[]) {
  return roles.includes("diretor");
}

/** Que estados o utilizador pode aplicar a um membro, segundo as regras da base de dados. */
export function allowedStatusChanges(opts: {
  myRoles: GroupRole[];
  targetRoles: GroupRole[];
  targetStatus: MemberStatus;
  isSelf: boolean;
}): MemberStatus[] {
  const { myRoles, targetRoles, targetStatus, isSelf } = opts;
  if (isSelf || !canManageMembers(myRoles) || targetStatus === "excluido") return [];
  if (isAdmin(targetRoles) && !myRoles.includes("diretor")) return [];
  const out: MemberStatus[] = [];
  if (targetStatus === "suspenso") out.push("ativo");
  if (targetStatus === "ativo" || targetStatus === "convidado") out.push("suspenso");
  out.push("excluido");
  return out;
}

export function sortRoles(roles: GroupRole[]) {
  return [...roles].sort((a, b) => ALL_ROLES.indexOf(a) - ALL_ROLES.indexOf(b));
}
