import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { groupQuery, myMembershipsQuery } from "@/lib/queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { canEditSettings } from "@/lib/roles";
import { RoleBadges } from "@/components/app/badges";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/grupo/$groupId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(myMembershipsQuery(context.user.id)),
      context.queryClient.ensureQueryData(groupQuery(params.groupId)),
    ]);
  },
  component: GroupLayout,
});

function GroupLayout() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data: group } = useSuspenseQuery(groupQuery(groupId));
  const { membership, roles } = useGroupAccess(user.id, groupId);

  if (!group || !membership) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">Grupo indisponível</h1>
        <p className="mt-1 text-sm text-muted-foreground">Não tem acesso a este grupo ou ele não existe.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/painel">Voltar aos meus grupos</Link>
        </Button>
      </main>
    );
  }

  const tabs = [
    { to: "/grupo/$groupId" as const, label: "Início", exact: true, show: true },
    { to: "/grupo/$groupId/membros" as const, label: "Membros", exact: false, show: true },
    { to: "/grupo/$groupId/direcao" as const, label: "Direção", exact: false, show: true },
    { to: "/grupo/$groupId/atividade" as const, label: "Atividade", exact: false, show: canEditSettings(roles) },
    { to: "/grupo/$groupId/definicoes" as const, label: "Definições", exact: false, show: canEditSettings(roles) },
  ].filter((t) => t.show);

  return (
    <div>
      <div className="border-b bg-surface">
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
          <Link to="/painel" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3.5" /> Os meus grupos
          </Link>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">{group.name}</h1>
            <RoleBadges roles={roles} />
          </div>
          <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" aria-label="Secções do grupo">
            {tabs.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                params={{ groupId }}
                activeOptions={{ exact: t.exact }}
                className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
