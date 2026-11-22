import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { boardQuery } from "@/lib/queries";
import { depositsQuery, DEPOSITS_PAGE, groupSavingsQuery, mySavingsQuery, type DepositRow } from "@/lib/finance-queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { canDecideOnDeposit, canManageFinance, formatMZN, DEPOSIT_STATUS_LABEL, type DepositStatus } from "@/lib/finance";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { DepositList, PaymentAccounts } from "@/components/app/FinanceParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/depositos")({
  head: () => ({
    meta: [
      { title: "Depósitos do grupo — SMART POUPA" },
      { name: "description", content: "Conferência e validação de depósitos, estornos, saldos e contas do grupo." },
      { property: "og:title", content: "Depósitos do grupo — SMART POUPA" },
      { property: "og:description", content: "Validação de depósitos e saldos do grupo de poupança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DepositsAdminPage,
});

function DepositsAdminPage() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { membership, roles } = useGroupAccess(user.id, groupId);
  const finance = canManageFinance(roles);
  const board = useQuery({ ...boardQuery(groupId), enabled: finance });
  const mine = useQuery({ ...mySavingsQuery(groupId), enabled: finance });
  const myProfileId = mine.data?.find((s) => s.scope === "coletivo")?.target_id ?? null;
  const otherFinanceAdmins = (board.data ?? []).filter(
    (b) => b.member_id !== membership?.id && b.roles.some((r) => r === "diretor" || r === "tesoureiro"),
  ).length;
  const isMine = (d: DepositRow) =>
    d.submitted_by === user.id || d.member_id === membership?.id || (!!myProfileId && d.collective_profile_id === myProfileId);
  const canDecide = (d: DepositRow) => canDecideOnDeposit({ isMine: isMine(d), otherFinanceAdmins });

  const [histStatus, setHistStatus] = useState<DepositStatus | "todos">("todos");
  const [page, setPage] = useState(0);
  const pending = useQuery({ ...depositsQuery(groupId, "pendente", 0), enabled: finance });
  const history = useQuery({ ...depositsQuery(groupId, histStatus, page), enabled: finance, placeholderData: keepPreviousData });
  const savings = useQuery({ ...groupSavingsQuery(groupId), enabled: finance });
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / DEPOSITS_PAGE));

  if (!finance) {
    return (
      <EmptyState title="Área reservada ao Diretor e ao Tesoureiro">
        <ShieldAlert className="mx-auto mt-2 size-5" />
      </EmptyState>
    );
  }
  const totalConfirmed = (savings.data ?? []).reduce((s, r) => s + r.confirmed, 0);
  const totalPending = (savings.data ?? []).reduce((s, r) => s + r.pending, 0);
  const listProps = { groupId, admin: true, isMine, canDecide, showReceipt: () => true };

  return (
    <div className="space-y-6">
      <PageHeader title="Depósitos" description="Confira cada comprovativo com o extrato antes de aprovar. Nada é apagado: correções fazem-se por estorno." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Poupança confirmada do grupo</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{savings.isLoading ? "…" : formatMZN(totalConfirmed)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">A aguardar validação</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{savings.isLoading ? "…" : formatMZN(totalPending)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Depósitos pendentes</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{pending.data?.total ?? "…"}</p>
        </Card>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="pendentes">
            Pendentes {pending.data?.total ? <Badge variant="gold" className="ml-1.5">{pending.data.total}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="saldos">Saldos</TabsTrigger>
          <TabsTrigger value="contas">Contas do grupo</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="mt-4">
          {pending.isLoading ? <Skeleton className="h-32 rounded-xl" /> : !pending.data?.rows.length ? (
            <EmptyState title="Não há depósitos à espera de validação" />
          ) : (
            <DepositList {...listProps} rows={pending.data.rows} />
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-3">
          <Select value={histStatus} onValueChange={(v) => { setHistStatus(v as DepositStatus | "todos"); setPage(0); }}>
            <SelectTrigger className="h-10 sm:w-56" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os estados</SelectItem>
              {(Object.keys(DEPOSIT_STATUS_LABEL) as DepositStatus[]).map((s) => <SelectItem key={s} value={s}>{DEPOSIT_STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {history.isLoading ? <Skeleton className="h-32 rounded-xl" /> : !history.data?.rows.length ? (
            <EmptyState title="Sem depósitos" />
          ) : (
            <DepositList {...listProps} rows={history.data.rows} />
          )}
          {pages > 1 ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="saldos" className="mt-4">
          {savings.isLoading ? <Skeleton className="h-40 rounded-xl" /> : (
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-4 py-2.5">Cota</th><th className="px-4 py-2.5 text-right">Confirmado</th><th className="hidden px-4 py-2.5 text-right sm:table-cell">Pendente</th></tr>
                </thead>
                <tbody className="divide-y">
                  {(savings.data ?? []).map((r) => (
                    <tr key={r.scope + r.target_id}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-foreground">{r.label}</span>
                        {r.scope === "coletivo" ? <Badge variant="secondary" className="ml-2">Coletivo</Badge> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatMZN(r.confirmed)}</td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{formatMZN(r.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="contas" className="mt-4">
          <PaymentAccounts groupId={groupId} manage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
