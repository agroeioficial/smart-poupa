import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EyeOff, MoreHorizontal, Phone, Plus, Search } from "lucide-react";
import { groupQuery, membersQuery, PAGE_SIZE, type MemberRow } from "@/lib/queries";
import { useGroupAccess } from "@/lib/use-group-access";
import {
  STATUS_LABEL,
  allowedStatusChanges,
  canAssignRoles,
  canManageMembers,
  isAdmin,
  type MemberStatus,
} from "@/lib/roles";
import { initials } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { RoleBadges, StatusBadge } from "@/components/app/badges";
import { AddMemberDialog, EditMemberDialog, RolesDialog, StatusConfirm } from "@/components/app/MemberDialogs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/membros")({
  head: () => ({
    meta: [
      { title: "Membros do grupo — SMART POUPA" },
      { name: "description", content: "Lista e cadastro de membros do grupo de poupança." },
      { property: "og:title", content: "Membros do grupo — SMART POUPA" },
      { property: "og:description", content: "Lista e cadastro de membros do grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MembersPage,
});

type StatusFilter = MemberStatus | "todos";
type StatusTarget = { member: MemberRow; status: Exclude<MemberStatus, "convidado"> };

function MembersPage() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data: group } = useSuspenseQuery(groupQuery(groupId));
  const { roles } = useGroupAccess(user.id, groupId);
  const admin = isAdmin(roles);
  const manage = canManageMembers(roles);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [rolesFor, setRolesFor] = useState<MemberRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    ...membersQuery(groupId, search, status, page),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const directoryHidden = !admin && !group?.member_directory_visible;

  return (
    <div>
      <PageHeader
        title="Membros"
        description={
          admin
            ? `${total} ${total === 1 ? "registo" : "registos"}`
            : "Apenas nome, contacto e profissão são partilhados entre membros."
        }
        actions={
          manage ? (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Cadastrar membro
            </Button>
          ) : null
        }
      />

      {directoryHidden ? (
        <Card className="mb-4 flex items-start gap-3 border-dashed p-4 text-sm">
          <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            O grupo não ativou a lista de membros. Por agora vê apenas o seu próprio registo.
          </p>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Pesquisar por nome"
            className="h-10 pl-9"
            aria-label="Pesquisar membros por nome"
          />
        </div>
        {admin ? (
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-10 sm:w-48" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os estados</SelectItem>
              {(Object.keys(STATUS_LABEL) as MemberStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={search ? "Nenhum membro encontrado" : "Ainda não há membros"}>
          {search ? "Tente outro nome." : manage ? "Use “Cadastrar membro” para começar." : null}
        </EmptyState>
      ) : (
        <Card className={`overflow-hidden p-0 ${isFetching ? "opacity-70" : ""}`}>
          <ul className="divide-y">
            {rows.map((m) => {
              const isSelf = m.user_id === user.id;
              const statusOptions = allowedStatusChanges({
                myRoles: roles,
                targetRoles: m.roles,
                targetStatus: m.status,
                isSelf,
              });
              const showMenu = manage;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground sm:flex">
                    {initials(m.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-semibold text-foreground">{m.full_name}</span>
                      {isSelf ? <span className="text-xs text-muted-foreground">(eu)</span> : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      {m.phone ? (
                        <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Phone className="size-3.5" /> {m.phone}
                        </a>
                      ) : null}
                      {m.profession ? <span>{m.profession}</span> : null}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
                      <RoleBadges roles={m.roles} />
                      {admin ? <StatusBadge status={m.status} /> : null}
                    </div>
                  </div>
                  <div className="hidden w-56 md:block">
                    <RoleBadges roles={m.roles} />
                  </div>
                  {admin ? (
                    <div className="hidden w-24 md:block">
                      <StatusBadge status={m.status} />
                    </div>
                  ) : null}
                  {showMenu ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações para ${m.full_name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(m)}>Editar dados</DropdownMenuItem>
                        {canAssignRoles(roles) ? (
                          <DropdownMenuItem onSelect={() => setRolesFor(m)}>Alterar papéis</DropdownMenuItem>
                        ) : null}
                        {statusOptions.length > 0 ? <DropdownMenuSeparator /> : null}
                        {statusOptions.map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onSelect={() => setStatusTarget({ member: m, status: s as StatusTarget["status"] })}
                            className={s === "excluido" ? "text-destructive focus:text-destructive" : undefined}
                          >
                            {s === "ativo" ? "Reativar" : s === "suspenso" ? "Suspender" : "Excluir"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page + 1} de {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Seguinte
            </Button>
          </div>
        </div>
      ) : null}

      {manage ? (
        <>
          <AddMemberDialog groupId={groupId} myRoles={roles} open={adding} onOpenChange={setAdding} />
          <EditMemberDialog groupId={groupId} member={editing} onClose={() => setEditing(null)} />
          <RolesDialog groupId={groupId} member={rolesFor} myRoles={roles} onClose={() => setRolesFor(null)} />
          <StatusConfirm groupId={groupId} target={statusTarget} onClose={() => setStatusTarget(null)} />
        </>
      ) : null}
    </div>
  );
}
