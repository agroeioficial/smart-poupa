import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { depositsQuery, DEPOSITS_PAGE, mySavingsQuery } from "@/lib/finance-queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { DepositList, PaymentAccounts, SavingsCards, SubmitDepositDialog } from "@/components/app/FinanceParts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/poupanca")({
  head: () => ({
    meta: [
      { title: "A minha poupança — SMART POUPA" },
      { name: "description", content: "Saldo confirmado, depósitos submetidos e contas do grupo para depósito." },
      { property: "og:title", content: "A minha poupança — SMART POUPA" },
      { property: "og:description", content: "Saldo, depósitos e comprovativos do membro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SavingsPage,
});

function SavingsPage() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { membership } = useGroupAccess(user.id, groupId);
  const savings = useQuery(mySavingsQuery(groupId));
  const collectiveRow = savings.data?.find((s) => s.scope === "coletivo") ?? null;
  const collective = collectiveRow ? { id: collectiveRow.target_id, name: collectiveRow.label } : null;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const deposits = useQuery({
    ...depositsQuery(groupId, "todos", page, { userId: user.id, memberId: membership?.id ?? "", profileId: collective?.id ?? null }),
    enabled: !!membership && savings.isSuccess,
    placeholderData: keepPreviousData,
  });
  const pages = Math.max(1, Math.ceil((deposits.data?.total ?? 0) / DEPOSITS_PAGE));
  if (!membership) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="A minha poupança"
        description="O saldo só muda depois de o Tesoureiro ou o Diretor validar o depósito."
        actions={<Button onClick={() => setOpen(true)}><Plus /> Submeter depósito</Button>}
      />
      <SavingsCards rows={savings.data} loading={savings.isLoading} />
      <PaymentAccounts groupId={groupId} manage={false} />
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Os meus depósitos</h2>
        {deposits.isLoading || savings.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : !deposits.data?.rows.length ? (
          <EmptyState title="Ainda não submeteu depósitos">Use “Submeter depósito” depois de transferir para a conta do grupo.</EmptyState>
        ) : (
          <DepositList
            groupId={groupId}
            rows={deposits.data.rows}
            admin={false}
            isMine={() => true}
            canDecide={() => false}
            showReceipt={(d) => d.submitted_by === user.id}
          />
        )}
        {pages > 1 ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
          </div>
        ) : null}
      </section>
      <SubmitDepositDialog groupId={groupId} userId={user.id} collective={collective} open={open} onOpenChange={setOpen} />
    </div>
  );
}
