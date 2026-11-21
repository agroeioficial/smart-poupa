import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, STATUS_LABEL, sortRoles, type GroupRole, type MemberStatus } from "@/lib/roles";

const STATUS_VARIANT: Record<MemberStatus, "success" | "warning" | "muted" | "destructive"> = {
  ativo: "success",
  convidado: "warning",
  pendente_aprovacao: "warning",
  suspenso: "muted",
  excluido: "destructive",
};

export function StatusBadge({ status }: { status: MemberStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function RoleBadges({ roles }: { roles: GroupRole[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sortRoles(roles).map((r) => (
        <Badge key={r} variant={r === "membro" ? "muted" : "role"}>
          {ROLE_LABEL[r]}
        </Badge>
      ))}
    </span>
  );
}
