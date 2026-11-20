import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendMemberInvite } from "@/lib/invites.functions";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { memberPrivateQuery, type MemberRow } from "@/lib/queries";
import { errorMessage, formatDate } from "@/lib/format";
import { ALL_ROLES, ROLE_LABEL, STATUS_LABEL, type GroupRole, type MemberStatus, type RequestState } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} é obrigatório.`).max(max, `${label} é demasiado longo.`);

const baseSchema = z.object({
  full_name: z.string().trim().min(2, "Indique o nome completo.").max(120),
  phone: required("O contacto", 30),
  profession: required("A profissão", 80),
  id_document_type: required("O tipo de documento", 40),
  id_document_number: required("O número do documento", 40),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "A data de nascimento é obrigatória.")
    .refine((d) => new Date(d) <= new Date(), "A data de nascimento não pode ser no futuro."),
  address: required("A morada", 200),
});
const addSchema = baseSchema.extend({ email: z.string().trim().email("Indique um email válido.").max(255) });
const reasonSchema = z.string().trim().min(3, "Indique o motivo (pelo menos 3 caracteres).").max(500);

export function useInvalidateMembers(groupId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["members", "members-private", "group-stats", "audit", "board", "board-requests", "admin-history"]) {
      qc.invalidateQueries({ queryKey: [key, groupId] });
    }
    qc.invalidateQueries({ queryKey: ["memberships"] });
  };
}

/** Envia (ou reenvia) o convite por email a um membro cadastrado. */
export function useSendInvite(groupId: string) {
  const send = useServerFn(sendMemberInvite);
  const invalidate = useInvalidateMembers(groupId);
  return useMutation({
    mutationFn: (memberId: string) => send({ data: { memberId, origin: window.location.origin } }),
    onSuccess: () => {
      toast.success("Convite enviado por email.");
      invalidate();
    },
    onError: (e) => toast.error(`O convite não foi enviado: ${errorMessage(e)}`),
  });
}

export function announceRequest(state: RequestState, applied: string) {
  if (state === "aprovado") toast.success(applied);
  else toast.success("Pedido registado. Aguarda a aprovação da direção no separador “Direção”.");
}

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {props.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input id={id} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function RolePicker({ value, onChange }: { value: GroupRole[]; onChange: (r: GroupRole[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ALL_ROLES.map((r) => (
        <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/60">
          <Checkbox
            checked={value.includes(r)}
            onCheckedChange={(c) => onChange(c ? [...value, r] : value.filter((x) => x !== r))}
          />
          {ROLE_LABEL[r]}
        </label>
      ))}
    </div>
  );
}

type PrivateDefaults = { id_document_type?: string | null; id_document_number?: string | null; birth_date?: string | null; address?: string | null };

function PrivateFields({ defaults, readOnly }: { defaults?: PrivateDefaults | undefined; readOnly?: boolean | undefined }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <fieldset className="space-y-3 rounded-lg border border-dashed p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Dados sensíveis — visíveis só à direção e ao próprio
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="m-doctype" name="id_document_type" label="Tipo de documento" placeholder="Ex.: BI" required readOnly={readOnly} defaultValue={defaults?.id_document_type ?? ""} />
        <Field id="m-docnum" name="id_document_number" label="Número do documento" required readOnly={readOnly} defaultValue={defaults?.id_document_number ?? ""} />
        <Field id="m-birth" name="birth_date" label="Data de nascimento" type="date" max={today} required readOnly={readOnly} defaultValue={defaults?.birth_date ?? ""} />
        <Field id="m-address" name="address" label="Morada" required readOnly={readOnly} defaultValue={defaults?.address ?? ""} />
      </div>
    </fieldset>
  );
}

export function AddMemberDialog({ groupId, open, onOpenChange }: { groupId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [roles, setRoles] = useState<GroupRole[]>(["membro"]);
  const invalidate = useInvalidateMembers(groupId);
  useEffect(() => {
    if (open) setRoles(["membro"]);
  }, [open]);
  const proposesAdmin = roles.some((r) => r !== "membro");
  const send = useServerFn(sendMemberInvite);

  const add = useMutation({
    mutationFn: async (v: z.infer<typeof addSchema>) => {
      const { data: memberId, error } = await supabase.rpc("add_group_member", {
        _group_id: groupId,
        _full_name: v.full_name,
        _email: v.email,
        _phone: v.phone,
        _profession: v.profession,
        _roles: roles,
        _id_document_type: v.id_document_type,
        _id_document_number: v.id_document_number,
        _birth_date: v.birth_date,
        _address: v.address,
      });
      if (error) throw error;
      try {
        await send({ data: { memberId: memberId as string, origin: window.location.origin } });
        return { email: v.email, inviteError: null as string | null };
      } catch (e) {
        return { email: v.email, inviteError: errorMessage(e) };
      }
    },
    onSuccess: ({ email, inviteError }) => {
      if (inviteError) {
        toast.warning(`Membro cadastrado, mas o convite não foi enviado: ${inviteError} Use “Reenviar convite” na lista.`, { duration: 10000 });
      } else {
        toast.success(
          `Membro cadastrado. O convite foi enviado para ${email}.` +
            (proposesAdmin ? " O cargo administrativo segue a aprovação da direção." : ""),
          { duration: 8000 },
        );
      }
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
          <DialogDescription>
            Todos os campos são obrigatórios. Nome, contacto e profissão podem ser vistos pelos membros, se o grupo ativar a lista.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="m-name" name="full_name" label="Nome completo" required />
          <Field id="m-email" name="email" type="email" label="Email" required hint="O convite é enviado para este email. O membro só define a palavra-passe. Não é mostrado aos outros membros." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="m-phone" name="phone" type="tel" label="Contacto" required />
            <Field id="m-prof" name="profession" label="Profissão" required />
          </div>
          <div className="space-y-1.5">
            <Label>Papéis</Label>
            <RolePicker value={roles} onChange={setRoles} />
            {proposesAdmin ? (
              <p className="text-xs text-muted-foreground">
                Cargos administrativos precisam da aprovação da direção antes de ficarem ativos.
              </p>
            ) : null}
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

/** Editar (Diretor, Secretário) ou só consultar (Tesoureiro) os dados de um membro. */
export function EditMemberDialog({ groupId, member, readOnly, onClose }: { groupId: string; member: MemberRow | null; readOnly?: boolean | undefined; onClose: () => void }) {
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
        _birth_date: v.birth_date,
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
    if (readOnly) return;
    const parsed = baseSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    save.mutate(parsed.data);
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{readOnly ? "Dados do membro" : "Editar membro"}</DialogTitle>
          <DialogDescription>
            {member ? `${STATUS_LABEL[member.status]} · cadastrado em ${formatDate(member.created_at)}` : null}
            {readOnly ? " · só consulta" : null}
          </DialogDescription>
        </DialogHeader>
        {member && priv.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
          </div>
        ) : member ? (
          <form key={member.id} onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field id="e-name" name="full_name" label="Nome completo" required readOnly={readOnly} defaultValue={member.full_name} />
            <div className="space-y-1.5">
              <Label>Email</Label>
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{priv.data?.email ?? "—"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="e-phone" name="phone" type="tel" label="Contacto" required readOnly={readOnly} defaultValue={member.phone ?? ""} />
              <Field id="e-prof" name="profession" label="Profissão" required readOnly={readOnly} defaultValue={member.profession ?? ""} />
            </div>
            <PrivateFields defaults={priv.data ?? undefined} readOnly={readOnly} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>{readOnly ? "Fechar" : "Cancelar"}</Button>
              {readOnly ? null : (
                <Button type="submit" disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar"}</Button>
              )}
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReasonField({ value, onChange, label = "Motivo" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="req-reason">
        {label}
        <span className="text-destructive"> *</span>
      </Label>
      <Textarea id="req-reason" value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} rows={3} />
    </div>
  );
}

/** Propor cargos para um membro; aplica-se após a aprovação da direção. */
export function ProposeRolesDialog({ groupId, member, onClose }: { groupId: string; member: MemberRow | null; onClose: () => void }) {
  const [roles, setRoles] = useState<GroupRole[]>([]);
  const [reason, setReason] = useState("");
  const invalidate = useInvalidateMembers(groupId);
  useEffect(() => {
    if (member) { setRoles(member.roles); setReason(""); }
  }, [member]);

  const save = useMutation({
    mutationFn: async (why: string) => {
      const { data, error } = await supabase.rpc("request_member_roles_change", { _member_id: member!.id, _roles: roles, _reason: why });
      if (error) throw error;
      return data as RequestState;
    },
    onSuccess: (state) => {
      announceRequest(state, "Cargos alterados.");
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function submit() {
    if (!roles.length) { toast.error("Indique pelo menos um papel."); return; }
    const r = reasonSchema.safeParse(reason);
    if (!r.success) { toast.error(r.error.issues[0]?.message ?? "Motivo inválido."); return; }
    save.mutate(r.data);
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Propor cargos para {member?.full_name}</DialogTitle>
          <DialogDescription>
            A alteração fica pendente até a direção aprovar. Um administrador que também é membro mantém um único registo.
          </DialogDescription>
        </DialogHeader>
        <RolePicker value={roles} onChange={setRoles} />
        <ReasonField value={reason} onChange={setReason} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "A enviar…" : "Enviar proposta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type StatusTarget = { member: MemberRow; status: Exclude<MemberStatus, "convidado"> };

const STATUS_COPY: Record<StatusTarget["status"], { title: string; body: string; action: string; done: string }> = {
  suspenso: {
    title: "Pedir suspensão",
    body: "Se for aprovado, o membro deixa de aceder ao grupo até ser reativado. Os registos dele mantêm-se.",
    action: "Pedir suspensão",
    done: "Membro suspenso.",
  },
  ativo: {
    title: "Pedir reativação",
    body: "Se for aprovado, o membro volta a ter acesso ao grupo.",
    action: "Pedir reativação",
    done: "Membro reativado.",
  },
  excluido: {
    title: "Pedir exclusão",
    body: "Se for aprovado, a exclusão é definitiva: o membro perde o acesso e não pode ser reativado. O registo é mantido no histórico.",
    action: "Pedir exclusão",
    done: "Membro excluído.",
  },
};

export function StatusRequestDialog({ groupId, target, onClose }: { groupId: string; target: StatusTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const invalidate = useInvalidateMembers(groupId);
  useEffect(() => {
    if (target) setReason("");
  }, [target]);
  const change = useMutation({
    mutationFn: async (why: string) => {
      const { data, error } = await supabase.rpc("request_member_status_change", {
        _member_id: target!.member.id,
        _status: target!.status,
        _reason: why,
      });
      if (error) throw error;
      return data as RequestState;
    },
    onSuccess: (state) => {
      announceRequest(state, STATUS_COPY[target!.status].done);
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const copy = target ? STATUS_COPY[target.status] : null;

  function submit() {
    const r = reasonSchema.safeParse(reason);
    if (!r.success) { toast.error(r.error.issues[0]?.message ?? "Motivo inválido."); return; }
    change.mutate(r.data);
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{target?.member.full_name}</strong> — {copy?.body}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Precisa da aprovação da direção: com 1 administrador aplica-se logo; com 2, aprovam os dois; com 3 ou mais, aprovam o Diretor, o Tesoureiro e o Secretário.
        </p>
        <ReasonField value={reason} onChange={setReason} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={submit}
            disabled={change.isPending}
            variant={target?.status === "excluido" ? "destructive" : "default"}
          >
            {change.isPending ? "A enviar…" : copy?.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
