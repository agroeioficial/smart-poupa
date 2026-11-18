import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Mail, MapPin, Phone, Users, UserPlus, UserMinus, ArrowRight } from "lucide-react";
import { groupQuery, groupStatsQuery } from "@/lib/queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { isAdmin, canManageMembers } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/")({
  head: () => ({
    meta: [
      { title: "Grupo — SMART POUPA" },
      { name: "description", content: "Resumo do grupo de poupança." },
      { property: "og:title", content: "Grupo — SMART POUPA" },
      { property: "og:description", content: "Resumo do grupo de poupança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupHome,
});

function GroupHome() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data: group } = useSuspenseQuery(groupQuery(groupId));
  const { membership, roles } = useGroupAccess(user.id, groupId);
  const admin = isAdmin(roles);
  const stats = useQuery({ ...groupStatsQuery(groupId), enabled: admin });

  if (!group || !membership) return null;

  return (
    <div className="space-y-6">
      {admin ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Users} label="Membros ativos" value={stats.data?.ativo} />
          <Stat icon={UserPlus} label="Convites por aceitar" value={stats.data?.convidado} />
          <Stat icon={UserMinus} label="Suspensos" value={stats.data?.suspenso} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-foreground">Sobre o grupo</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row icon={MapPin} label="Localidade / sede" value={group.location} />
            <Row icon={Phone} label="Contacto oficial" value={group.official_phone} />
            <Row icon={Mail} label="Email oficial" value={group.official_email} />
          </dl>
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-foreground">A minha participação</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Nome no grupo</dt>
              <dd className="text-right font-medium">{membership.full_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Membro desde</dt>
              <dd className="font-medium">{formatDate(membership.joined_at)}</dd>
            </div>
          </dl>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link to="/grupo/$groupId/membros" params={{ groupId }}>
              {canManageMembers(roles) ? "Gerir membros" : "Ver membros"} <ArrowRight />
            </Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | undefined }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value ?? "—"}</p>
      </div>
    </Card>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium text-foreground">{value || "—"}</dd>
      </div>
    </div>
  );
}
