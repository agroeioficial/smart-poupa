import type { Membership } from "./queries";

/** Grupos que contam para o menu "Os meus grupos": ativos ou com convite por aceitar. */
export function relevantGroups(memberships: Membership[]) {
  return memberships.filter((m) => m.group && (m.status === "ativo" || m.status === "convidado"));
}

/** Se a pessoa está ativa num único grupo (e sem outros convites), devolve esse grupo. */
export function singleGroupId(memberships: Membership[]): string | null {
  const relevant = relevantGroups(memberships);
  return relevant.length === 1 && relevant[0]!.status === "ativo" ? relevant[0]!.group_id : null;
}

/** O menu "Os meus grupos" só aparece a quem pertence a mais de um grupo (nunca à AGROEI). */
export function showMyGroups(memberships: Membership[], isOwner: boolean) {
  return !isOwner && relevantGroups(memberships).length > 1;
}
