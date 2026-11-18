import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { memberPrivateQuery, type MemberRow } from "@/lib/queries";
import { errorMessage, formatDate } from "@/lib/format";
import { ALL_ROLES, ROLE_LABEL, STATUS_LABEL, canAssignRoles, type GroupRole, type MemberStatus } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const optional = (max: number) => z.string().trim().max(max);
const baseSchema = z.object({
  full_name: z.string().trim().min(2, "Indique o nome completo.").max(120),
  phone: optional(30),
  profession: optional(80),
  id_document_type: optional(40),
  id_document_number: optional(40),
  birth_date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida.")]),
  address: optional(200),
});
const addSchema = baseSchema.extend({ email: z.string().trim().email("Indique um email válido.").max(255) });

function useInvalidateMembers(groupId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["members", groupId] });
    qc.invalidateQueries({ queryKey: ["group-stats", groupId] });
    qc.invalidateQueries({ queryKey: ["audit", groupId] });
  };
}

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function RolePicker({ value, onChange, myRoles }: { value: GroupRole[]; onChange: (r: GroupRole[]) => void; myRoles: GroupRole[] }) {
  const director = canAssignRoles(myRoles);
  return (
    <div className="grid grid-cols-2 gap-2">
      {ALL_ROLES.map((r) => {
        const disabled = r !== "membro" && !director;
        const checked = value.includes(r);
        return (
          <label
            key={r}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted/60"}`}
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(c) => onChange(c ? [...value, r] : value.filter((x) => x !== r))}
            />
            {ROLE_LABEL[r]}
          </label>
        );
      })}
      {!director ? (
        <p className="col-span-2 text-xs text-muted-foreground">Só o Diretor pode atribuir papéis administrativos.</p>
      ) : null}
    </div>
  );
}

function PrivateFields({ defaults }: { defaults?: undefined | { id_document_type?: string | null; id_document_number?: string | null; birth_date?: string | null; address?: string | null } }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-dashed p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Dados sensíveis — visíveis só ao Diretor, Secretário e ao próprio
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="m-doctype" name="id_document_type" label="Tipo de documento" placeholder="Ex.: BI" defaultValue={defaults?.id_document_type ?? ""} />
        <Field id="m-docnum" name="id_document_number" label="Número do documento" defaultValue={defaults?.id_document_number ?? ""} />
        <Field id="m-birth" name="birth_date" label="Data de nascimento" type="date" defaultValue={defaults?.birth_date ?? ""} />
        <Field id="m-address" name="address" label="Morada" defaultValue={defaults?.address ?? ""} />
      </div>
    </fieldset>
  );
}

export function AddMemberDialog({ groupId, myRoles, open, onOpenChange }: { groupId: string; myRoles: GroupRole[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [roles, setRoles] = useState<GroupRole[]>(["membro"]);
  const invalidate = useInvalidateMembers(groupId);
  useEffect(() => {
    if (open) setRoles(["membro"]);
  }, [open]);

  const add = useMutation({
    mutationFn: async (v: z.infer<typeof addSchema>) => {
      const { error } = await supabase.rpc("add_group_member", {
        _group_id: groupId,
        _full_name: v.full_name,
        _email: v.email,
        _phone: v.phone,
        _profession: v.profession,
        _roles: roles,
        _id_document_type: v.id_document_type,
        _id_document_number: v.id_document_number,
        _address: v.address,
        ...(v.birth_date ? { _birth_date: v.birth_date } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Membro cadastrado. Fica como “Convidado” até entrar com o email indicado e aceitar.");
      invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (roles.length === 0) { toast.error("Indique pelo menos um papel."); return; }
    const parsed = addSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    add.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Cadastrar membro</DialogTitle>
          <DialogDescription>Nome, contacto e profissão podem ser vistos pelos membros, se o grupo ativar a lista.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="m-name" name="full_name" label="Nome completo" required />
          <Field id="m-email" name="email" type="email" label="Email" required hint="Usado para o membro entrar na sua própria conta. Não é mostrado aos outros membros." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="m-phone" name="phone" type="tel" label="Contacto" />
            <Field id="m-prof" name="profession" label="Profissão" />
          </div>
          <div className="space-y-1.5">
            <Label>Papéis</Label>
            <RolePicker value={roles} onChange={setRoles} myRoles={myRoles} />
          </div>
          <PrivateFields />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={add.isPending}>{add.isPending ? "A guardar…" : "Cadastrar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditMemberDialog({ groupId, member, onClose }: { groupId: string; member: MemberRow | null; onClose: () => void }) {
  const invalidate = useInvalidateMembers(groupId);
  const qc = useQueryClient();
  const priv = useQuery({ ...memberPrivateQuery(member?.id ?? ""), enabled: !!member });

  const save = useMutation({
    mutationFn: async (v: z.infer<typeof baseSchema>) => {
      const { error } = await supabase.rpc("update_group_member", {
        _member_id: member!.id,
        _full_name: v.full_name,
        _phone: v.phone,
        _profession: v.profession,
        _id_document_type: v.id_document_type,
        _id_document_number: v.id_document_number,
        _birth_date: (v.birth_date || null) as string,
        _address: v.address,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados atualizados.");
      invalidate();
      qc.invalidateQueries({ queryKey: ["member-private", member!.id] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = baseSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    save.mutate(parsed.data);
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar membro</DialogTitle>
          <DialogDescription>
            {member ? `${STATUS_LABEL[member.status]} · cadastrado em ${formatDate(member.created_at)}` : null}
          </DialogDescription>
        </DialogHeader>
        {member && priv.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
          </div>
        ) : member ? (
          <form key={member.id} onSubmit={onSubmit} className="space-y-4">
            <Field id="e-name" name="full_name" label="Nome completo" required defaultValue={member.full_name} />
            <div className="space-y-1.5">
              <Label>Email</Label>
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{priv.data?.email ?? "—"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="e-phone" name="phone" type="tel" label="Contacto" defaultValue={member.phone ?? ""} />
              <Field id="e-prof" name="profession" label="Profissão" defaultValue={member.profession ?? ""} />
            </div>
            <PrivateFields defaults={priv.data ?? undefined} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function RolesDialog({ groupId, member, myRoles, onClose }: { groupId: string; member: MemberRow | null; myRoles: GroupRole[]; onClose: () => void }) {
  const [roles, setRoles] = useState<GroupRole[]>([]);
  const invalidate = useInvalidateMembers(groupId);
  const qc = useQueryClient();
  useEffect(() => {
    if (member) setRoles(member.roles);
  }, [member]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_member_roles", { _member_id: member!.id, _roles: roles });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Papéis atualizados.");
      invalidate();
      qc.invalidateQueries({ queryKey: ["memberships"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Papéis de {member?.full_name}</DialogTitle>
          <DialogDescription>Um administrador que também é membro mantém um único registo.</DialogDescription>
        </DialogHeader>
        <RolePicker value={roles} onChange={setRoles} myRoles={myRoles} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => (roles.length ? save.mutate() : toast.error("Indique pelo menos um papel."))} disabled={save.isPending}>
            Guardar papéis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COPY: Record<Exclude<MemberStatus, "convidado">, { title: string; body: string; action: string }> = {
  suspenso: {
    title: "Suspender membro?",
    body: "O membro deixa de aceder ao grupo até ser reativado. Os registos dele mantêm-se.",
    action: "Suspender",
  },
  ativo: { title: "Reativar membro?", body: "O membro volta a ter acesso ao grupo.", action: "Reativar" },
  excluido: {
    title: "Excluir membro?",
    body: "A exclusão é definitiva: o membro perde o acesso e não pode ser reativado. O registo é mantido no histórico.",
    action: "Excluir definitivamente",
  },
};

export function StatusConfirm({
  groupId,
  target,
  onClose,
}: {
  groupId: string;
  target: { member: MemberRow; status: Exclude<MemberStatus, "convidado"> } | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateMembers(groupId);
  const change = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_member_status", { _member_id: target!.member.id, _status: target!.status });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Estado alterado para “${STATUS_LABEL[target!.status]}”.`);
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const copy = target ? STATUS_COPY[target.status] : null;
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="text-foreground">{target?.member.full_name}</strong> — {copy?.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              change.mutate();
            }}
            disabled={change.isPending}
            className={target?.status === "excluido" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {copy?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
