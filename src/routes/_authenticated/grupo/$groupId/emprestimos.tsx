import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { HandCoins } from "lucide-react";
import { boardQuery } from "@/lib/queries";
import { DEFAULT_LOAN_SETTINGS, loanSettingsQuery, loansQuery } from "@/lib/loan-queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { isAdmin } from "@/lib/roles";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { LoanList, LoanRulesSummary, RequestLoanDialog } from "@/components/app/LoanParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/emprestimos")({
  head: () => ({
    meta: [
      { title: "Empréstimos — SMART POUPA" },
      { name: "description", content: "Pedidos de empréstimo do grupo e votação da direção." },
      { property: "og:title", content: "Empréstimos — SMART POUPA" },
      { property: "og:description", content: "Pedir empréstimo e acompanhar a aprovação da direção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoansPage,
});

function LoansPage() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { membership, roles } = useGroupAccess(user.id, groupId);
  const admin = isAdmin(roles);
  const memberId = membership?.id ?? null;
  const [requesting, setRequesting] = useState(false);

  const settingsQ = useQuery(loanSettingsQuery(groupId));
  const settings = settingsQ.data ?? DEFAULT_LOAN_SETTINGS;
  const board = useQuery(boardQuery(groupId));
  const mine = useQuery({ ...loansQuery(groupId, { memberId: memberId ?? "" }), enabled: !!memberId });
  const open = useQuery({ ...loansQuery(groupId, "abertos"), enabled: admin });
  const history = useQuery({ ...loansQuery(groupId, "historico"), enabled: admin });

  const pendingForMe = (open.data ?? []).filter(
    (l) => l.member_id !== memberId && !l.votes.some((v) => v.memberId === memberId),
  ).length;
  const listProps = { groupId, board: board.data ?? [], settings, myRoles: roles, myMemberId: memberId };

  const myList = mine.isLoading ? <Skeleton className="h-32 rounded-xl" /> : !mine.data?.length ? (
    <EmptyState title="Ainda não fez pedidos de empréstimo">
      Use “Pedir empréstimo” para enviar um pedido à direção.
    </EmptyState>
  ) : (
    <LoanList {...listProps} loans={mine.data} showVotes={admin} />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empréstimos"
        description="Os pedidos são decididos pela direção. A SMART POUPA não entrega dinheiro: só regista."
        actions={<Button onClick={() => setRequesting(true)} disabled={settingsQ.isLoading}><HandCoins /> Pedir empréstimo</Button>}
      />
      {settingsQ.isLoading ? <Skeleton className="h-24 rounded-xl" /> : <LoanRulesSummary settings={settings} />}

      {admin ? (
        <Tabs defaultValue="decidir">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="decidir">
              Para decidir {pendingForMe ? <Badge variant="gold" className="ml-1.5">{pendingForMe}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="meus">Os meus pedidos</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="decidir" className="mt-4">
            {open.isLoading || board.isLoading ? <Skeleton className="h-32 rounded-xl" /> : !open.data?.length ? (
              <EmptyState title="Não há pedidos de empréstimo em análise" />
            ) : (
              <LoanList {...listProps} loans={open.data} showVotes />
            )}
          </TabsContent>
          <TabsContent value="meus" className="mt-4">{myList}</TabsContent>
          <TabsContent value="historico" className="mt-4">
            {history.isLoading ? <Skeleton className="h-32 rounded-xl" /> : !history.data?.length ? (
              <EmptyState title="Ainda não há pedidos decididos" />
            ) : (
              <LoanList {...listProps} loans={history.data} showVotes />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Os meus pedidos</h2>
          {myList}
        </section>
      )}

      <RequestLoanDialog groupId={groupId} userId={user.id} settings={settings} open={requesting} onOpenChange={setRequesting} />
    </div>
  );
}
