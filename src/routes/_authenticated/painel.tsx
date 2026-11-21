import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Building2, MailOpen, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { myMembershipsQuery, platformOwnerQuery } from "@/lib/queries";
import { singleGroupId } from "@/lib/navigation";
import { errorMessage } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { RoleBadges, StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WaitingApproval } from "@/components/app/GovernanceParts";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Os meus grupos — SMART POUPA" },
      { name: "description", content: "Grupos de poupança a que pertence e convites pendentes." },
      { property: "og:title", content: "Os meus grupos — SMART POUPA" },
      { property: "og:description", content: "Grupos de poupança a que pertence e convites pendentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    const [memberships, isOwner] = await Promise.all([
      context.queryClient.ensureQueryData(myMembershipsQuery(context.user.id)),
      context.queryClient.ensureQueryData(platformOwnerQuery(context.user.id)),
    ]);
    // A AGROEI não participa em poupança: vai direto à sua área.
    if (isOwner) throw redirect({ to: "/agroei", replace: true });
    // Quem pertence a um único grupo entra direto nesse grupo.
    const single = singleGroupId(memberships);
    if (single) throw redirect({ to: "/grupo/$groupId", params: { groupId: single }, replace: true });
  },
  component: Painel,
});

function Painel() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: memberships } = useSuspenseQuery(myMembershipsQuery(user.id));
  const { data: isOwner } = useSuspenseQuery(platformOwnerQuery(user.id));

  const accept = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc("accept_invitation", { _member_id: memberId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Convite aceite.");
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const invites = memberships.filter((m) => m.status === "convidado" && m.group);
  const active = memberships.filter((m) => m.status === "ativo" && m.group);
  const waiting = memberships.filter((m) => m.status === "pendente_aprovacao" && m.group);
  const inactive = memberships.filter((m) => m.status === "suspenso" || m.status === "excluido");
  const firstName = ((user.user_metadata?.["full_name"] as string | undefined) ?? "").split(" ")[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Os meus grupos"}
        description="Escolha um grupo para continuar."
        actions={
          isOwner ? (
            <Button asChild variant="outline">
              <Link to="/agroei">
                <Building2 /> Área AGROEI
              </Link>
            </Button>
          ) : null
        }
      />

      {invites.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Convites pendentes
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {invites.map((m) => (
              <Card key={m.id} className="flex flex-col gap-4 border-gold/50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/20 text-warning-foreground">
                    <MailOpen className="size-[18px]" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{m.group?.name}</p>
                    <p className="text-sm text-muted-foreground">Foi convidado como</p>
                    <div className="mt-1">
                      <RoleBadges roles={m.roles} />
                    </div>
                  </div>
                </div>
                <Button onClick={() => accept.mutate(m.id)} disabled={accept.isPending}>
                  Aceitar convite
                </Button>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {waiting.length > 0 ? (
        <section className="mb-8 space-y-3">
          {waiting.map((m) => (
            <WaitingApproval key={m.id} groupName={m.group?.name ?? ""} />
          ))}
        </section>
      ) : null}

      {waiting.length > 0 && active.length === 0 && invites.length === 0 ? null : (
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Grupos</h2>
        {active.length === 0 ? (
          invites.length > 0 ? (
            <EmptyState title="Aceite o convite acima para entrar no grupo" />
          ) : (
            <EmptyState title="Ainda não pertence a nenhum grupo">
              Peça ao Diretor ou Secretário do seu grupo para o cadastrar com o email <strong>{user.email}</strong>.
            </EmptyState>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((m) => (
              <Link
                key={m.id}
                to="/grupo/$groupId"
                params={{ groupId: m.group_id }}
                className="group rounded-xl border bg-card p-5 shadow-card transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-bold text-foreground">{m.group?.name}</p>
                  <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                {m.group?.location ? (
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" /> {m.group.location}
                  </p>
                ) : null}
                <div className="mt-4">
                  <RoleBadges roles={m.roles} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      )}

      {inactive.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sem acesso</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {inactive.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">{m.full_name}</span>
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
