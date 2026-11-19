import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminHistoryQuery, boardQuery, boardRequestsQuery, PAGE_SIZE, type BoardRequest } from "@/lib/queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { ROLE_LABEL, STATUS_LABEL, approvalProgress, isAdmin, sortRoles, type GroupRole, type RequestState } from "@/lib/roles";
import { errorMessage, formatDate, formatDateTime, initials } from "@/lib/format";
import { useInvalidateMembers, announceRequest } from "@/components/app/MemberDialogs";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { RoleBadges } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/direcao")({
  head: () => ({
    meta: [
      { title: "Direção do grupo — SMART POUPA" },
      { name: "description", content: "Direção atual, pedidos à espera de aprovação e histórico de cargos do grupo." },
      { property: "og:title", content: "Direção do grupo — SMART POUPA" },
      { property: "og:description", content: "Direção atual e histórico de cargos do grupo de poupança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(boardQuery(params.groupId)),
  component: BoardPage,
});

const HISTORY_LABEL: Record<string, string> = {
  atribuido: "passou a",
  removido: "deixou de ser",
  suspenso: "foi suspenso(a) — era",
  excluido: "foi excluído(a) — era",
  reativado: "foi reativado(a) como",
};

function BoardPage() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { membership, roles } = useGroupAccess(user.id, groupId);
  const admin = isAdmin(roles);
  const { data: board } = useSuspenseQuery(boardQuery(groupId));
  const requests = useQuery({ ...boardRequestsQuery(groupId), enabled: admin });
  const [page, setPage] = useState(0);
  const history = useQuery({ ...adminHistoryQuery(groupId, page), placeholderData: keepPreviousData });
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Direção"
        description="Quem dirige o grupo e todas as mudanças de cargos. Visível a todos os membros do grupo."
      />

      {admin ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pedidos à espera de decisão
          </h2>
          {requests.isLoading ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : !requests.data?.length ? (
            <Card className="p-5 text-sm text-muted-foreground">Não há pedidos pendentes.</Card>
          ) : (
            <div className="space-y-3">
              {requests.data.map((r) => (
                <RequestCard key={r.id} groupId={groupId} request={r} board={board} myMemberId={membership?.id ?? ""} myUserId={user.id} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Direção atual</h2>
        {board.length === 0 ? (
          <EmptyState title="Sem administradores ativos" />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y">
              {board.map((b) => (
                <li key={b.member_id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                    {initials(b.full_name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{b.full_name}</span>
                  <RoleBadges roles={b.roles.filter((x) => x !== "membro")} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Histórico da direção</h2>
        {history.isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : !history.data?.rows.length ? (
          <EmptyState title="Ainda não há mudanças registadas" />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y">
              {history.data.rows.map((h) => (
                <li key={h.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <span className="text-sm text-foreground">
                    <strong className="font-semibold">{h.member_name}</strong> {HISTORY_LABEL[h.action] ?? h.action}{" "}
                    <strong className="font-semibold">{ROLE_LABEL[h.role as GroupRole]}</strong>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {h.actor_label} · {formatDateTime(h.created_at)}
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
      </section>
    </div>
  );
}

function rolesText(roles: GroupRole[]) {
  return roles.length ? sortRoles(roles).map((r) => ROLE_LABEL[r]).join(", ") : "sem cargos";
}

function RequestCard({
  groupId,
  request: r,
  board,
  myMemberId,
  myUserId,
}: {
  groupId: string;
  request: BoardRequest;
  board: { member_id: string; full_name: string; roles: GroupRole[] }[];
  myMemberId: string;
  myUserId: string;
}) {
  const invalidate = useInvalidateMembers(groupId);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const eligible = board.filter((b) => b.member_id !== r.member_id).map((b) => ({ memberId: b.member_id, roles: b.roles }));
  const progress = approvalProgress({
    eligible,
    approvals: r.votes.filter((v) => v.vote === "aprovado").map((v) => v.voter_member_id),
    rejected: r.votes.some((v) => v.vote === "rejeitado"),
  });
  const alreadyVoted = r.votes.some((v) => v.voter_member_id === myMemberId);
  const canVote = !alreadyVoted && myMemberId !== r.member_id && eligible.some((e) => e.memberId === myMemberId);
  const isRequester = r.requested_by === myUserId;

  const vote = useMutation({
    mutationFn: async (v: { approve: boolean; reason?: string }) => {
      const { data, error } = await supabase.rpc("vote_member_status_request", {
        _request_id: r.id,
        _approve: v.approve,
        _reason: v.reason ?? "",
      });
      if (error) throw error;
      return data as RequestState;
    },
    onSuccess: (state) => {
      if (state === "rejeitado") toast.success("Pedido rejeitado.");
      else if (state === "aprovado") announceRequest(state, "Pedido aprovado e aplicado.");
      else toast.success("Voto registado. Ainda faltam aprovações.");
      setRejecting(false);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_member_status_request", { _request_id: r.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido cancelado.");
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-foreground">
            {r.kind === "papeis" ? "Cargos de " : r.requested_status === "ativo" ? "Reativar " : r.requested_status === "suspenso" ? "Suspender " : "Excluir "}
            {r.member_name}
          </p>
          {r.kind === "papeis" ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {rolesText(r.from_roles)} <ArrowRight className="size-3.5" /> <span className="font-medium text-foreground">{rolesText(r.requested_roles)}</span>
            </p>
          ) : r.from_status && r.requested_status ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {STATUS_LABEL[r.from_status]} <ArrowRight className="size-3.5" /> <span className="font-medium text-foreground">{STATUS_LABEL[r.requested_status]}</span>
            </p>
          ) : null}
          <p className="text-sm text-foreground">“{r.reason}”</p>
          <p className="text-xs text-muted-foreground">
            Pedido por {r.requester_name} · {formatDate(r.created_at)}
          </p>
        </div>
        <Badge variant="gold" className="shrink-0 self-start">
          {progress.have} de {progress.need} aprovações
        </Badge>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {r.votes.map((v) => (
          <li key={v.voter_member_id}>
            <Badge variant={v.vote === "aprovado" ? "success" : "destructive"} title={v.reason ?? undefined}>
              {v.vote === "aprovado" ? <Check className="mr-1 size-3" /> : <X className="mr-1 size-3" />}
              {v.voter_name}
            </Badge>
          </li>
        ))}
      </ul>
      {progress.missingRoles.length ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Falta a aprovação de: {progress.missingRoles.map((x) => ROLE_LABEL[x]).join(", ")}
        </p>
      ) : null}

      {canVote || isRequester ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {canVote ? (
            <>
              <Button size="sm" onClick={() => vote.mutate({ approve: true })} disabled={vote.isPending}>
                <Check /> Aprovar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setReason(""); setRejecting(true); }} disabled={vote.isPending}>
                <X /> Rejeitar
              </Button>
            </>
          ) : null}
          {isRequester ? (
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Cancelar pedido
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar pedido</DialogTitle>
            <DialogDescription>Uma rejeição encerra o pedido. Indique o motivo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Motivo<span className="text-destructive"> *</span></Label>
            <Textarea id="reject-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={vote.isPending}
              onClick={() => {
                if (reason.trim().length < 3) { toast.error("Indique o motivo (pelo menos 3 caracteres)."); return; }
                vote.mutate({ approve: false, reason: reason.trim() });
              }}
            >
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
