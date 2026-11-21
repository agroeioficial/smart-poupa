import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Bell, Clock, HeartHandshake, Lock, Pencil, Plus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  beneficiaryHistoryQuery,
  beneficiaryQuery,
  collectiveMembersQuery,
  collectiveProfilesQuery,
  groupEventsQuery,
  type CollectiveProfile,
  type MemberRow,
} from "@/lib/queries";
import {
  BENEFICIARY_DOCUMENTS,
  RELATION_TYPES,
  type BeneficiaryDocument,
  type RelationType,
} from "@/lib/roles";
import { errorMessage, formatDate, formatDateTime } from "@/lib/format";
import { useInvalidateMembers } from "@/components/app/MemberDialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const docLabel = (t: string) => BENEFICIARY_DOCUMENTS[t as BeneficiaryDocument] ?? t;
const relLabel = (t: string) => RELATION_TYPES[t as RelationType] ?? t;

/* ===================== Ecrã de espera ===================== */

export function WaitingApproval({ groupName }: { groupName: string }) {
  return (
    <Card className="mx-auto max-w-lg p-6 text-center sm:p-8">
      <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-gold/20 text-warning-foreground">
        <Lock className="size-5" />
      </span>
      <h2 className="text-lg font-bold text-foreground">A aguardar aprovação da direção</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A sua conta no grupo <strong className="text-foreground">{groupName}</strong> está criada. Assim que todos os
        administradores aprovarem a sua entrada, terá acesso ao grupo.
      </p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" /> Não precisa de fazer mais nada.
      </p>
    </Card>
  );
}

/* ===================== Avisos do grupo ===================== */

export function GroupEventsCard({ groupId }: { groupId: string }) {
  const { data, isLoading } = useQuery(groupEventsQuery(groupId));
  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;
  if (!data?.length) return null;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold text-foreground">
        <Bell className="size-4 text-muted-foreground" /> Novidades do grupo
      </h2>
      <ul className="mt-3 divide-y text-sm">
        {data.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong className="font-semibold text-foreground">{e.member_name}</strong> foi admitido(a) no grupo.
            </span>
            <span className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ===================== Beneficiário por morte ===================== */

const beneficiarySchema = z.object({
  full_name: z.string().trim().min(3, "Indique o nome completo do beneficiário.").max(120),
  relationship: z.string().trim().min(2, "Indique a relação ou parentesco.").max(60),
  phone: z.string().trim().min(6, "Indique o contacto telefónico.").max(30),
  document_type: z.enum(["bi", "cedula", "cartao_eleitor", "carta_conducao", "passaporte"], {
    message: "Escolha o tipo de documento.",
  }),
  document_number: z.string().trim().min(2, "Indique o número do documento.").max(40),
});

/** Cartão do próprio membro: indicar ou alterar o beneficiário (sem aprovação, fica no histórico). */
export function MyBeneficiaryCard({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(beneficiaryQuery(memberId));
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<string>("");

  const save = useMutation({
    mutationFn: async (v: z.infer<typeof beneficiarySchema>) => {
      const { error } = await supabase.rpc("set_my_beneficiary", {
        _member_id: memberId,
        _full_name: v.full_name,
        _relationship: v.relationship,
        _phone: v.phone,
        _document_type: v.document_type,
        _document_number: v.document_number,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Beneficiário guardado.");
      qc.invalidateQueries({ queryKey: ["beneficiary", memberId] });
      qc.invalidateQueries({ queryKey: ["beneficiary-history", memberId] });
      setOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = beneficiarySchema.safeParse({ ...Object.fromEntries(new FormData(e.currentTarget)), document_type: docType });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    save.mutate(parsed.data);
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <HeartHandshake className="size-4 text-muted-foreground" /> Beneficiário por morte
        </h2>
        <Badge variant="outline" className="gap-1"><Lock className="size-3" /> Confidencial</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Pessoa com direito a resgatar a sua poupança em caso de falecimento. Só a direção do grupo vê estes dados.
      </p>
      {isLoading ? (
        <Skeleton className="mt-4 h-16" />
      ) : data ? (
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Nome</dt><dd className="text-right font-medium">{data.full_name}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Relação</dt><dd className="font-medium">{data.relationship}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Atualizado</dt><dd className="font-medium">{formatDate(data.updated_at)}</dd></div>
        </dl>
      ) : (
        <p className="mt-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">Ainda não indicou um beneficiário.</p>
      )}
      <Button
        variant="outline"
        className="mt-4 w-full"
        onClick={() => { setDocType(data?.document_type ?? ""); setOpen(true); }}
      >
        {data ? <><Pencil /> Alterar beneficiário</> : <><Plus /> Indicar beneficiário</>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Beneficiário por morte</DialogTitle>
            <DialogDescription>Não precisa de aprovação. Cada alteração fica registada em histórico, sob sigilo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Nome completo *</Label>
              <Input id="b-name" name="full_name" maxLength={120} defaultValue={data?.full_name ?? ""} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="b-rel">Relação / parentesco *</Label>
                <Input id="b-rel" name="relationship" maxLength={60} placeholder="Ex.: Filha" defaultValue={data?.relationship ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-phone">Contacto telefónico *</Label>
                <Input id="b-phone" name="phone" type="tel" maxLength={30} defaultValue={data?.phone ?? ""} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de documento *</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger aria-label="Tipo de documento"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BENEFICIARY_DOCUMENTS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-doc">Número do documento *</Label>
                <Input id="b-doc" name="document_number" maxLength={40} defaultValue={data?.document_number ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Consulta pela direção (só leitura), dentro dos dados do membro. */
export function BeneficiaryAdminView({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery(beneficiaryQuery(memberId));
  const history = useQuery(beneficiaryHistoryQuery(memberId));
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
        <Lock className="size-3.5" /> Beneficiário por morte (sigiloso)
      </p>
      {isLoading ? (
        <Skeleton className="h-12" />
      ) : data ? (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Nome</dt><dd>{data.full_name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Relação</dt><dd>{data.relationship}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Contacto</dt><dd>{data.phone}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Documento</dt><dd>{docLabel(data.document_type)} · {data.document_number}</dd></div>
        </dl>
      ) : (
        <p className="text-muted-foreground">O membro ainda não indicou beneficiário.</p>
      )}
      {(history.data?.length ?? 0) > 1 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Histórico ({history.data!.length} registos)</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {history.data!.map((h) => (
              <li key={h.id}>{formatDateTime(h.created_at)} — {h.full_name} ({h.relationship}, {docLabel(h.document_type)})</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/* ===================== Perfis coletivos ===================== */

export function CollectiveProfilesSection({ groupId, manage }: { groupId: string; manage: boolean }) {
  const { data, isLoading } = useQuery(collectiveProfilesQuery(groupId));
  const [viewing, setViewing] = useState<CollectiveProfile | null>(null);
  const [editing, setEditing] = useState<CollectiveProfile | "new" | null>(null);
  if (isLoading) return <Skeleton className="mb-6 h-20 rounded-xl" />;
  if (!data?.length && !manage) return null;
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Perfis coletivos</h2>
        {manage ? (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus /> Novo perfil</Button>
        ) : null}
      </div>
      {!data?.length ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Ainda não há perfis coletivos. Um perfil (ex.: família, amigos) conta como uma única cota no grupo.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{relLabel(p.relation_type)} · uma cota</p>
                </div>
                <Badge variant="secondary" className="shrink-0 gap-1"><Users className="size-3" /> {p.member_count}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setViewing(p)}>Ver integrantes</Button>
                {manage ? (
                  <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditing(p)}><Pencil /></Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <CollectiveMembersDialog groupId={groupId} profile={viewing} onClose={() => setViewing(null)} />
      {manage ? <ProfileFormDialog groupId={groupId} profile={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function CollectiveMembersDialog({ groupId, profile, onClose }: { groupId: string; profile: CollectiveProfile | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ ...collectiveMembersQuery(groupId, profile?.id ?? ""), enabled: !!profile });
  return (
    <Dialog open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{profile?.name}</DialogTitle>
          <DialogDescription>
            {profile ? `${relLabel(profile.relation_type)} · ${profile.member_count} ${profile.member_count === 1 ? "integrante" : "integrantes"} · conta como uma cota` : null}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">Ainda sem integrantes ativos.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.map((m) => (
              <li key={m.id} className="px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{m.full_name}</p>
                <p className="text-xs text-muted-foreground">{[m.phone, m.profession].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileFormDialog({ groupId, profile, onClose }: { groupId: string; profile: CollectiveProfile | "new" | null; onClose: () => void }) {
  const invalidate = useInvalidateMembers(groupId);
  const existing = profile && profile !== "new" ? profile : null;
  const [relation, setRelation] = useState<string>("");
  const save = useMutation({
    mutationFn: async (v: { name: string; relation: string }) => {
      const { error } = existing
        ? await supabase.rpc("update_collective_profile", { _profile_id: existing.id, _name: v.name, _relation_type: v.relation })
        : await supabase.rpc("create_collective_profile", { _group_id: groupId, _name: v.name, _relation_type: v.relation });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(existing ? "Perfil atualizado." : "Perfil coletivo criado. Associe os integrantes na lista de membros.");
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (name.length < 2) { toast.error("Indique o nome do perfil."); return; }
    if (!relation) { toast.error("Escolha o tipo de relação."); return; }
    save.mutate({ name, relation });
  }
  return (
    <Dialog open={!!profile} onOpenChange={(o) => { if (!o) onClose(); else setRelation(existing?.relation_type ?? ""); }}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={() => setRelation(existing?.relation_type ?? "")}>
        <DialogHeader>
          <DialogTitle>{existing ? "Editar perfil coletivo" : "Novo perfil coletivo"}</DialogTitle>
          <DialogDescription>Cada integrante mantém a sua conta; perante o grupo, o perfil conta como uma única cota.</DialogDescription>
        </DialogHeader>
        <form key={existing?.id ?? "new"} onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Nome do perfil *</Label>
            <Input id="cp-name" name="name" maxLength={120} placeholder="Ex.: Família Silva" defaultValue={existing?.name ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de relação *</Label>
            <Select value={relation} onValueChange={setRelation}>
              <SelectTrigger aria-label="Tipo de relação"><SelectValue placeholder="Escolher" /></SelectTrigger>
              <SelectContent>
                {Object.entries(RELATION_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const NONE = "__nenhum";

/** Associar um membro a um perfil coletivo (Diretor, Secretário). */
export function AssignCollectiveDialog({ groupId, member, onClose }: { groupId: string; member: MemberRow | null; onClose: () => void }) {
  const invalidate = useInvalidateMembers(groupId);
  const { data: profiles } = useQuery({ ...collectiveProfilesQuery(groupId), enabled: !!member });
  const [value, setValue] = useState<string>(NONE);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_member_collective_profile", {
        _member_id: member!.id,
        _profile_id: (value === NONE ? null : value) as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil coletivo atualizado.");
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={() => setValue(member?.collective_profile_id ?? NONE)}>
        <DialogHeader>
          <DialogTitle>Perfil coletivo</DialogTitle>
          <DialogDescription>{member?.full_name} mantém a sua conta própria; o perfil conta como uma cota no grupo.</DialogDescription>
        </DialogHeader>
        {!profiles?.length ? (
          <p className="text-sm text-muted-foreground">Crie primeiro um perfil coletivo em “Novo perfil”.</p>
        ) : (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger aria-label="Perfil coletivo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem perfil (cota individual)</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending || !profiles?.length} onClick={() => save.mutate()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
