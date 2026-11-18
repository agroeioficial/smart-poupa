import { useSuspenseQuery } from "@tanstack/react-query";
import { myMembershipsQuery } from "./queries";

/** Papéis do utilizador num grupo (apenas para decidir o que mostrar; a base de dados aplica as regras). */
export function useGroupAccess(userId: string, groupId: string) {
  const { data } = useSuspenseQuery(myMembershipsQuery(userId));
  const membership = data.find((m) => m.group_id === groupId && m.status === "ativo") ?? null;
  return { membership, roles: membership?.roles ?? [] };
}
