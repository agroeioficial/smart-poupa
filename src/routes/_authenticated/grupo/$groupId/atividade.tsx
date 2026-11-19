import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { auditQuery, PAGE_SIZE } from "@/lib/queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { canEditSettings } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/atividade")({
  head: () => ({
    meta: [
      { title: "Atividade do grupo — SMART POUPA" },
      { name: "description", content: "Histórico de ações administrativas do grupo." },
      { property: "og:title", content: "Atividade do grupo — SMART POUPA" },
      { property: "og:description", content: "Histórico de ações administrativas do grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

const ACTION_LABEL: Record<string, string> = {
  grupo_criado: "Grupo criado pela AGROEI",
  definicoes_alteradas: "Definições do grupo alteradas",
  membro_cadastrado: "Membro cadastrado",
  membro_editado: "Dados de membro editados",
  estado_alterado: "Estado de membro alterado",
  papeis_alterados: "Papéis de membro alterados",
  convite_aceite: "Convite aceite",
  pedido_criado: "Pedido à direção criado",
  pedido_estado_criado: "Pedido à direção criado",
  pedido_estado_aprovado: "Voto a favor de um pedido",
  pedido_estado_rejeitado: "Voto contra um pedido",
  pedido_estado_cancelado: "Pedido cancelado",
};

function ActivityPage() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { roles } = useGroupAccess(user.id, groupId);
  const [page, setPage] = useState(0);
  const allowed = canEditSettings(roles);
  const { data, isLoading } = useQuery({ ...auditQuery(groupId, page), enabled: allowed, placeholderData: keepPreviousData });

  if (!allowed) return <p className="text-sm text-muted-foreground">Apenas o Diretor pode consultar a atividade.</p>;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Atividade" description="Registo de quem fez o quê e quando. Os registos não podem ser alterados." />
      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : !data?.rows.length ? (
        <EmptyState title="Sem atividade registada" />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {data.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="text-sm font-medium text-foreground">{ACTION_LABEL[r.action] ?? r.action}</span>
                <span className="text-xs text-muted-foreground">
                  {r.actor_id === user.id ? "Por mim · " : ""}
                  {formatDateTime(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {pages > 1 ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
        </div>
      ) : null}
    </div>
  );
}
