import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Landmark, Plus, Undo2, Upload, Wallet, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { paymentAccountsQuery, type DepositRow, type SavingsRow } from "@/lib/finance-queries";
import {
  CHANNEL_LABEL,
  DEPOSIT_STATUS_LABEL,
  RECEIPT_TYPES,
  daysSince,
  formatMZN,
  parseAmount,
  receiptProblem,
  type DepositStatus,
  type PaymentChannel,
} from "@/lib/finance";
import { errorMessage, formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CHANNELS = Object.keys(CHANNEL_LABEL) as PaymentChannel[];

export function useInvalidateFinance(groupId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["deposits", "my-savings", "group-savings", "payment-accounts", "audit"]) {
      qc.invalidateQueries({ queryKey: [key, groupId] });
    }
  };
}

/* ===================== Saldos ===================== */

export function SavingsCards({ rows, loading }: { rows: SavingsRow[] | undefined; loading: boolean }) {
  if (loading) return <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>;
  if (!rows?.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <Card key={r.scope + r.target_id} className="p-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" /> {r.scope === "individual" ? "A minha poupança" : `Cota coletiva · ${r.label}`}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatMZN(r.confirmed)}</p>
          <p className="text-xs text-muted-foreground">Saldo confirmado</p>
          {r.pending > 0 ? (
            <p className="mt-2 text-sm text-warning-foreground">
              + {formatMZN(r.pending)} <span className="text-muted-foreground">a aguardar validação</span>
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

/* ===================== Contas do grupo ===================== */

export function PaymentAccounts({ groupId, manage }: { groupId: string; manage: boolean }) {
  const invalidate = useInvalidateFinance(groupId);
  const { data, isLoading } = useQuery(paymentAccountsQuery(groupId));
  const [adding, setAdding] = useState(false);
  const toggle = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("set_payment_account_active", { _account_id: v.id, _active: v.active });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const list = (data ?? []).filter((a) => manage || a.active);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Contas do grupo para depósito</h2>
        {manage ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus /> Nova conta</Button> : null}
      </div>
      {isLoading ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : !list.length ? (
        <Card className="p-4 text-sm text-muted-foreground">
          {manage ? "Registe as contas e carteiras onde os membros depositam." : "A direção ainda não indicou as contas do grupo."}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <Card key={a.id} className={`flex items-start gap-3 p-4 ${a.active ? "" : "opacity-60"}`}>
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Landmark className="size-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-foreground">{a.channel === "banco" ? a.institution : CHANNEL_LABEL[a.channel]}</p>
                <p className="font-mono tabular-nums text-foreground">{a.account_number}</p>
                <p className="text-xs text-muted-foreground">Titular: {a.holder_name}</p>
              </div>
              {manage ? (
                <Switch
                  checked={a.active}
                  aria-label={a.active ? "Desativar conta" : "Ativar conta"}
                  onCheckedChange={(v) => toggle.mutate({ id: a.id, active: v })}
                />
              ) : null}
            </Card>
          ))}
        </div>
      )}
      {manage ? <AddAccountDialog groupId={groupId} open={adding} onOpenChange={setAdding} /> : null}
    </section>
  );
}

function AddAccountDialog({ groupId, open, onOpenChange }: { groupId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateFinance(groupId);
  const [channel, setChannel] = useState<PaymentChannel | "">("");
  const save = useMutation({
    mutationFn: async (v: { institution: string; number: string; holder: string }) => {
      const { error } = await supabase.rpc("create_payment_account", {
        _group_id: groupId,
        _channel: channel as PaymentChannel,
        _institution: v.institution,
        _account_number: v.number,
        _holder_name: v.holder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta registada.");
      invalidate();
      onOpenChange(false);
      setChannel("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = { institution: String(f.get("institution") ?? "").trim(), number: String(f.get("number") ?? "").trim(), holder: String(f.get("holder") ?? "").trim() };
    if (!channel) { toast.error("Escolha o canal."); return; }
    if (channel === "banco" && !v.institution) { toast.error("Indique o nome do banco."); return; }
    if (v.number.length < 3) { toast.error("Indique o número da conta ou carteira."); return; }
    if (v.holder.length < 2) { toast.error("Indique o titular."); return; }
    save.mutate(v);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conta do grupo</DialogTitle>
          <DialogDescription>Depois de registada, a conta não se edita; para mudar, registe outra e desative esta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label>Canal *</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as PaymentChannel)}>
              <SelectTrigger aria-label="Canal"><SelectValue placeholder="Escolher" /></SelectTrigger>
              <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {channel === "banco" ? (
            <div className="space-y-1.5">
              <Label htmlFor="acc-inst">Banco *</Label>
              <Input id="acc-inst" name="institution" maxLength={80} placeholder="Ex.: BCI, Millennium bim" />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="acc-num">{channel === "banco" ? "Número da conta / NIB *" : "Número da carteira *"}</Label>
            <Input id="acc-num" name="number" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-holder">Titular *</Label>
            <Input id="acc-holder" name="holder" maxLength={120} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Submeter depósito ===================== */

export function SubmitDepositDialog({
  groupId,
  userId,
  collective,
  open,
  onOpenChange,
}: {
  groupId: string;
  userId: string;
  collective: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const invalidate = useInvalidateFinance(groupId);
  const { data: accounts } = useQuery({ ...paymentAccountsQuery(groupId), enabled: open });
  const [target, setTarget] = useState<"individual" | "coletivo">("individual");
  const [channel, setChannel] = useState<PaymentChannel | "">("");
  const [accountId, setAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const channelAccounts = (accounts ?? []).filter((a) => a.active && a.channel === channel);

  function reset() {
    setTarget("individual"); setChannel(""); setAccountId(""); setFile(null);
  }

  const submit = useMutation({
    mutationFn: async (v: { amount: number; date: string; ref: string; notes: string }) => {
      const ext = file!.type === "application/pdf" ? "pdf" : file!.type.split("/")[1] ?? "img";
      const path = `${groupId}/${userId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("comprovativos").upload(path, file!, { contentType: file!.type, upsert: false });
      if (up.error) throw new Error(`O comprovativo não foi enviado: ${up.error.message}`);
      const { error } = await supabase.rpc("submit_deposit", {
        _group_id: groupId,
        _for_collective: target === "coletivo",
        _amount: v.amount,
        _deposit_date: v.date,
        _channel: channel as PaymentChannel,
        _payment_account_id: (accountId || null) as string,
        _transaction_ref: v.ref,
        _receipt_path: path,
        _notes: v.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Depósito submetido. Fica pendente até o Tesoureiro ou o Diretor o validar.");
      invalidate();
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = parseAmount(String(f.get("amount") ?? ""));
    const date = String(f.get("date") ?? "");
    const ref = String(f.get("ref") ?? "").trim();
    if (amount === null) { toast.error("Indique um valor válido em MZN (até 2 casas decimais)."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error("Indique a data do depósito."); return; }
    if (date > new Date().toISOString().slice(0, 10)) { toast.error("A data não pode ser no futuro."); return; }
    if (!channel) { toast.error("Escolha o canal de pagamento."); return; }
    if (ref.length < 3) { toast.error("Indique a referência / ID da transação."); return; }
    const problem = receiptProblem(file);
    if (problem) { toast.error(problem); return; }
    submit.mutate({ amount, date, ref, notes: String(f.get("notes") ?? "") });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submeter depósito</DialogTitle>
          <DialogDescription>Faça primeiro a transferência para a conta do grupo. Aqui só regista o depósito com o comprovativo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          {collective ? (
            <div className="space-y-1.5">
              <Label>Para *</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as "individual" | "coletivo")}>
                <SelectTrigger aria-label="Para quem é o depósito"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">A minha poupança individual</SelectItem>
                  <SelectItem value="coletivo">Cota coletiva · {collective.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dep-amount">Valor (MT) *</Label>
              <Input id="dep-amount" name="amount" inputMode="decimal" placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-date">Data do depósito *</Label>
              <Input id="dep-date" name="date" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Canal *</Label>
              <Select value={channel} onValueChange={(v) => { setChannel(v as PaymentChannel); setAccountId(""); }}>
                <SelectTrigger aria-label="Canal de pagamento"><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Conta do grupo</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={!channelAccounts.length}>
                <SelectTrigger aria-label="Conta do grupo"><SelectValue placeholder={channelAccounts.length ? "Escolher" : "Sem contas"} /></SelectTrigger>
                <SelectContent>
                  {channelAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.channel === "banco" ? `${a.institution} · ` : ""}{a.account_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-ref">Referência / ID da transação *</Label>
            <Input id="dep-ref" name="ref" maxLength={80} placeholder="Ex.: código da mensagem M-Pesa" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-file">Comprovativo (PDF ou imagem, até 5 MB) *</Label>
            <label htmlFor="dep-file" className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-primary/50">
              <Upload className="size-4" /> {file ? file.name : "Escolher ficheiro"}
            </label>
            <input id="dep-file" type="file" accept={RECEIPT_TYPES.join(",")} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-notes">Observações</Label>
            <Textarea id="dep-notes" name="notes" rows={2} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={submit.isPending}>{submit.isPending ? "A enviar…" : "Submeter"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Lista de depósitos ===================== */

const STATUS_VARIANT: Record<DepositStatus, "warning" | "success" | "destructive"> = {
  pendente: "warning",
  aprovado: "success",
  rejeitado: "destructive",
};

function waitingText(createdAt: string) {
  const n = daysSince(createdAt);
  return n === 0 ? " · à espera desde hoje" : ` · à espera há ${n} ${n === 1 ? "dia" : "dias"}`;
}

export function ReceiptButton({ path, label = "Comprovativo" }: { path: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const w = window.open("", "_blank");
        const { data, error } = await supabase.storage.from("comprovativos").createSignedUrl(path, 120);
        setBusy(false);
        if (error || !data) { w?.close(); toast.error("Não foi possível abrir o documento."); return; }
        if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
      }}
    >
      <FileText /> {label}
    </Button>
  );
}

export function DepositList({
  groupId,
  rows,
  admin,
  isMine,
  canDecide,
  showReceipt,
}: {
  groupId: string;
  rows: DepositRow[];
  admin: boolean;
  isMine: (d: DepositRow) => boolean;
  canDecide: (d: DepositRow) => boolean;
  showReceipt: (d: DepositRow) => boolean;
}) {
  const invalidate = useInvalidateFinance(groupId);
  const [action, setAction] = useState<{ kind: "rejeitar" | "estornar"; deposit: DepositRow } | null>(null);
  const [reason, setReason] = useState("");

  const review = useMutation({
    mutationFn: async (v: { id: string; approve: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("review_deposit", { _deposit_id: v.id, _approve: v.approve, _reason: v.reason ?? "" });
      if (error) throw error;
      return v.approve;
    },
    onSuccess: (approved) => {
      toast.success(approved ? "Depósito aprovado. O saldo foi creditado." : "Depósito rejeitado.");
      invalidate();
      setAction(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reverse = useMutation({
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reverse_deposit", { _deposit_id: v.id, _reason: v.reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estorno registado. O movimento original continua no histórico.");
      invalidate();
      setAction(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <Card className="overflow-hidden p-0">
        <ul className="divide-y">
          {rows.map((d) => {
            const mine = isMine(d);
            const decide = admin && canDecide(d);
            return (
              <li key={d.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold tabular-nums text-foreground">{formatMZN(d.amount)}</span>
                    <Badge variant={STATUS_VARIANT[d.status]}>{DEPOSIT_STATUS_LABEL[d.status]}</Badge>
                    {d.reversal ? <Badge variant="muted">Estornado</Badge> : null}
                    {d.collective_profile_id ? <Badge variant="secondary">Cota coletiva</Badge> : null}
                  </div>
                  <p className="text-sm text-foreground">
                    {admin || d.collective_profile_id ? <strong className="font-semibold">{d.target_name}</strong> : null}
                    {admin || d.collective_profile_id ? " · " : null}
                    {CHANNEL_LABEL[d.channel]} · Ref. <span className="font-mono">{d.transaction_ref}</span> · {formatDate(d.deposit_date)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submetido{d.submitter_name ? ` por ${d.submitter_name}` : ""} em {formatDateTime(d.created_at)}
                    {d.status === "pendente" ? waitingText(d.created_at) : ""}
                    {d.reviewed_at ? ` · ${d.status === "aprovado" ? "validado" : "rejeitado"}${d.reviewer_name ? ` por ${d.reviewer_name}` : ""} em ${formatDateTime(d.reviewed_at)}` : ""}
                  </p>
                  {d.notes ? <p className="text-xs text-muted-foreground">“{d.notes}”</p> : null}
                  {d.rejection_reason ? <p className="text-sm text-destructive">Motivo da rejeição: {d.rejection_reason}</p> : null}
                  {d.reversal ? (
                    <p className="text-sm text-muted-foreground">Estornado em {formatDateTime(d.reversal.created_at)}: {d.reversal.reason}</p>
                  ) : null}
                  {admin && mine && !decide && (d.status === "pendente" || (d.status === "aprovado" && !d.reversal)) ? (
                    <p className="text-xs text-muted-foreground">É um depósito seu: outro Diretor ou Tesoureiro deve decidir.</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {showReceipt(d) ? <ReceiptButton path={d.receipt_path} /> : null}
                  {decide && d.status === "pendente" ? (
                    <>
                      <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: d.id, approve: true })}>
                        <Check /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setReason(""); setAction({ kind: "rejeitar", deposit: d }); }}>
                        <X /> Rejeitar
                      </Button>
                    </>
                  ) : null}
                  {decide && d.status === "aprovado" && !d.reversal ? (
                    <Button size="sm" variant="ghost" onClick={() => { setReason(""); setAction({ kind: "estornar", deposit: d }); }}>
                      <Undo2 /> Estornar
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action?.kind === "estornar" ? "Estornar depósito" : "Rejeitar depósito"}</DialogTitle>
            <DialogDescription>
              {action
                ? action.kind === "estornar"
                  ? `Será registado um lançamento inverso de ${formatMZN(action.deposit.amount)} na conta de ${action.deposit.target_name}. O depósito original continua no histórico.`
                  : `${formatMZN(action.deposit.amount)} de ${action.deposit.target_name} não entra no saldo. O membro verá o motivo.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="fin-reason">Motivo *</Label>
            <Textarea id="fin-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={review.isPending || reverse.isPending}
              onClick={() => {
                if (!action) return;
                if (reason.trim().length < 3) { toast.error("Indique o motivo (pelo menos 3 caracteres)."); return; }
                if (action.kind === "estornar") reverse.mutate({ id: action.deposit.id, reason: reason.trim() });
                else review.mutate({ id: action.deposit.id, approve: false, reason: reason.trim() });
              }}
            >
              {action?.kind === "estornar" ? "Confirmar estorno" : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
