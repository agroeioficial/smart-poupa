import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { BoardMember } from "@/lib/queries";
import type { LoanRow, LoanSettings } from "@/lib/loan-queries";
import { RECEIPT_TYPES, daysSince, formatMZN, parseAmount, receiptProblem } from "@/lib/finance";
import {
  INTEREST_METHOD_HINT,
  INTEREST_METHOD_LABEL,
  LOAN_STATUS_LABEL,
  canOpenLoanDocuments,
  canVoteOnLoan,
  isOpenLoan,
  loanApproval,
  loanRequestProblem,
  parseRate,
  parseTerm,
  voteDeadlinePassed,
  type InterestMethod,
  type LoanStatus,
} from "@/lib/loans";
import { ROLE_LABEL, sortRoles, type GroupRole } from "@/lib/roles";
import { errorMessage, formatDateTime } from "@/lib/format";
import { ReceiptButton } from "@/components/app/FinanceParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function useInvalidateLoans(groupId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["loans", "audit"]) qc.invalidateQueries({ queryKey: [key, groupId] });
  };
}

export function interestText(method: LoanSettings["interest_method"], rate: number | null) {
  if (!method || rate === null) return null;
  return `${String(rate).replace(".", ",")}% · ${INTEREST_METHOD_LABEL[method]}`;
}

/* ===================== Regras do grupo ===================== */

export function LoanRulesSummary({ settings }: { settings: LoanSettings }) {
  const interest = interestText(settings.interest_method, settings.interest_rate);
  return (
    <Card className="grid gap-4 p-5 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Juros do grupo</p>
        <p className="mt-1 font-medium text-foreground">{interest ?? "Ainda não definidos pela direção"}</p>
        {settings.interest_method ? <p className="text-xs text-muted-foreground">{INTEREST_METHOD_HINT[settings.interest_method]}</p> : null}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Garantia</p>
        <p className="mt-1 font-medium text-foreground">{settings.guarantee_required ? "Obrigatória" : "Opcional"}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resposta da direção</p>
        <p className="mt-1 font-medium text-foreground">
          {settings.vote_deadline_days ? `Até ${settings.vote_deadline_days} ${settings.vote_deadline_days === 1 ? "dia" : "dias"}` : "Sem prazo definido"}
        </p>
      </div>
    </Card>
  );
}

/* ===================== Pedir empréstimo ===================== */

function FilePick({ id, label, file, onChange }: { id: string; label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-primary/50">
        <Upload className="size-4" /> {file ? file.name : "Escolher ficheiro (PDF ou imagem, até 5 MB)"}
      </label>
      <input id={id} type="file" accept={RECEIPT_TYPES.join(",")} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </div>
  );
}

async function uploadLoanDoc(groupId: string, userId: string, file: File) {
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] ?? "img";
  const path = `${groupId}/${userId}/emprestimos/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("comprovativos").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(`O documento não foi enviado: ${up.error.message}`);
  return path;
}

export function RequestLoanDialog({
  groupId,
  userId,
  settings,
  open,
  onOpenChange,
}: {
  groupId: string;
  userId: string;
  settings: LoanSettings;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const invalidate = useInvalidateLoans(groupId);
  const [declaration, setDeclaration] = useState<File | null>(null);
  const [guarantee, setGuarantee] = useState<File | null>(null);
  const interest = interestText(settings.interest_method, settings.interest_rate);

  function reset() { setDeclaration(null); setGuarantee(null); }

  const submit = useMutation({
    mutationFn: async (v: { amount: number; term: number; purpose: string; guaranteeDescription: string }) => {
      const declarationPath = await uploadLoanDoc(groupId, userId, declaration!);
      const guaranteePath = guarantee ? await uploadLoanDoc(groupId, userId, guarantee) : null;
      const { error } = await supabase.rpc("submit_loan_request", {
        _group_id: groupId,
        _amount: v.amount,
        _term_months: v.term,
        _purpose: v.purpose,
        _declaration_path: declarationPath,
        _guarantee_description: v.guaranteeDescription,
        _guarantee_path: guaranteePath as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido enviado à direção. Acompanhe aqui o estado da aprovação.");
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
    const term = parseTerm(String(f.get("term") ?? ""));
    const purpose = String(f.get("purpose") ?? "").trim();
    const guaranteeDescription = String(f.get("guarantee") ?? "").trim();
    const problem = loanRequestProblem({
      amount, term, purpose, declaration: !!declaration,
      guaranteeRequired: settings.guarantee_required, guaranteeDescription, guaranteeFile: !!guarantee,
    });
    if (problem) { toast.error(problem); return; }
    const fileProblem = receiptProblem(declaration) ?? (guarantee ? receiptProblem(guarantee) : null);
    if (fileProblem) { toast.error(fileProblem.replace("O comprovativo", "O documento")); return; }
    submit.mutate({ amount: amount!, term: term!, purpose, guaranteeDescription });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedir empréstimo</DialogTitle>
          <DialogDescription>
            O pedido vai para a direção. O dinheiro é entregue fora da aplicação, só depois da aprovação.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="loan-amount">Valor pretendido (MT) *</Label>
              <Input id="loan-amount" name="amount" inputMode="decimal" placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-term">Prazo (meses) *</Label>
              <Input id="loan-term" name="term" inputMode="numeric" placeholder="Ex.: 6" />
            </div>
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Juros do grupo: <strong className="text-foreground">{interest ?? "ainda não definidos pela direção"}</strong>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="loan-purpose">Finalidade *</Label>
            <Textarea id="loan-purpose" name="purpose" rows={3} maxLength={1000} placeholder="Para que vai usar o dinheiro?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-guarantee">Garantia {settings.guarantee_required ? "*" : "(opcional)"}</Label>
            <Textarea id="loan-guarantee" name="guarantee" rows={2} maxLength={1000} placeholder="Ex.: bem, fiador ou outra garantia" />
          </div>
          <FilePick
            id="loan-guarantee-file"
            label={`Documento ou fotografia da garantia${settings.guarantee_required ? " *" : " (opcional)"}`}
            file={guarantee}
            onChange={setGuarantee}
          />
          <FilePick id="loan-declaration" label="Declaração de dívida e compromisso, assinada *" file={declaration} onChange={setDeclaration} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={submit.isPending}>{submit.isPending ? "A enviar…" : "Enviar pedido"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Lista de pedidos ===================== */

const STATUS_VARIANT: Record<LoanStatus, "warning" | "success" | "destructive" | "muted" | "secondary"> = {
  submetido: "warning",
  em_analise: "warning",
  aprovado: "success",
  rejeitado: "destructive",
  cancelado: "muted",
  desembolsado: "secondary",
  em_pagamento: "secondary",
  liquidado: "success",
  em_incumprimento: "destructive",
};

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{LOAN_STATUS_LABEL[status]}</Badge>;
}

export function LoanList({
  groupId,
  loans,
  board,
  settings,
  myRoles,
  myMemberId,
  showVotes,
}: {
  groupId: string;
  loans: LoanRow[];
  board: BoardMember[];
  settings: LoanSettings;
  myRoles: GroupRole[];
  myMemberId: string | null;
  showVotes: boolean;
}) {
  const invalidate = useInvalidateLoans(groupId);
  const [action, setAction] = useState<{ kind: "rejeitar" | "cancelar"; loan: LoanRow } | null>(null);
  const [reason, setReason] = useState("");

  const vote = useMutation({
    mutationFn: async (v: { id: string; approve: boolean; reason?: string }) => {
      const { data, error } = await supabase.rpc("vote_loan", { _loan_id: v.id, _approve: v.approve, _reason: v.reason ?? "" });
      if (error) throw error;
      return data as LoanStatus;
    },
    onSuccess: (status) => {
      toast.success(
        status === "aprovado" ? "Voto registado. O empréstimo foi aprovado pela direção."
          : status === "rejeitado" ? "Voto registado. O pedido foi rejeitado e o membro verá o motivo."
            : "Voto registado. Faltam votos de outros administradores.",
      );
      invalidate();
      setAction(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("cancel_loan_request", { _loan_id: v.id, _reason: v.reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pedido cancelado."); invalidate(); setAction(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const boardInput = board.map((b) => ({ memberId: b.member_id, roles: b.roles }));
  const nameOf = (id: string) => board.find((b) => b.member_id === id)?.full_name;

  return (
    <>
      <div className="space-y-3">
        {loans.map((l) => {
          const mine = l.member_id === myMemberId;
          const open = isOpenLoan(l.status);
          const progress = loanApproval({ board: boardInput, borrowerMemberId: l.member_id, votes: l.votes });
          const myVote = l.votes.find((v) => v.memberId === myMemberId);
          const voteable = canVoteOnLoan({ myRoles, myMemberId, borrowerMemberId: l.member_id, status: l.status, alreadyVoted: !!myVote });
          const late = open && voteDeadlinePassed(l.created_at, settings.vote_deadline_days);
          const days = daysSince(l.created_at);
          const interest = interestText(l.interest_method, l.interest_rate);
          return (
            <Card key={l.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold tabular-nums text-foreground">{formatMZN(l.amount)}</span>
                    <LoanStatusBadge status={l.status} />
                    {late ? <Badge variant="destructive"><Clock className="mr-1 size-3" /> Prazo de votação ultrapassado</Badge> : null}
                  </div>
                  <p className="text-sm text-foreground">
                    {!mine ? <><strong className="font-semibold">{l.borrower_name}</strong> · </> : null}
                    {l.term_months} {l.term_months === 1 ? "mês" : "meses"}
                    {interest ? ` · Juros: ${interest}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Finalidade:</span> {l.purpose}</p>
                  {l.guarantee_description ? (
                    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Garantia:</span> {l.guarantee_description}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Pedido em {formatDateTime(l.created_at)}
                    {open ? (days === 0 ? " · à espera desde hoje" : ` · à espera há ${days} ${days === 1 ? "dia" : "dias"}`) : ""}
                    {l.decided_at ? ` · decidido em ${formatDateTime(l.decided_at)}` : ""}
                  </p>
                  {l.rejection_reason ? <p className="text-sm text-destructive">Motivo da rejeição: {l.rejection_reason}</p> : null}
                  {l.status === "cancelado" ? <p className="text-sm text-muted-foreground">Cancelado por quem pediu{l.cancel_reason ? `: ${l.cancel_reason}` : "."}</p> : null}
                  {l.status === "aprovado" ? (
                    <p className="text-sm text-success">Aprovado pela direção. O dinheiro é entregue fora da aplicação; o registo da entrega vem na etapa seguinte.</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canOpenLoanDocuments({ myRoles, isMine: mine }) ? (
                    <>
                      <ReceiptButton path={l.declaration_path} label="Declaração" />
                      {l.guarantee_path ? <ReceiptButton path={l.guarantee_path} label="Garantia" /> : null}
                    </>
                  ) : null}
                  {voteable ? (
                    <>
                      <Button size="sm" disabled={vote.isPending} onClick={() => vote.mutate({ id: l.id, approve: true })}><Check /> Aprovar</Button>
                      <Button size="sm" variant="outline" onClick={() => { setReason(""); setAction({ kind: "rejeitar", loan: l }); }}><X /> Rejeitar</Button>
                    </>
                  ) : null}
                  {mine && open ? (
                    <Button size="sm" variant="ghost" onClick={() => { setReason(""); setAction({ kind: "cancelar", loan: l }); }}>Cancelar pedido</Button>
                  ) : null}
                </div>
              </div>

              {showVotes ? (
                <div className="mt-4 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Votos da direção{open ? ` · ${progress.have} de ${progress.need} aprovações` : ""}
                    {open && progress.missingRoles.length ? ` · falta: ${progress.missingRoles.map((r) => ROLE_LABEL[r]).join(", ")}` : ""}
                  </p>
                  {mine && !l.votes.length && open ? <p className="text-xs text-muted-foreground">É um pedido seu: não vota nele.</p> : null}
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {(open ? progress.eligible : []).map((e) => {
                      const v = l.votes.find((x) => x.memberId === e.memberId);
                      return (
                        <li key={e.memberId} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">{nameOf(e.memberId) ?? v?.name ?? "—"}</span>
                          <span className="text-xs text-muted-foreground">{sortRoles(e.roles).filter((r) => r !== "membro").map((r) => ROLE_LABEL[r]).join(", ")}</span>
                          {v ? <Badge variant={v.vote === "aprovado" ? "success" : "destructive"}>{v.vote === "aprovado" ? "Aprovou" : "Rejeitou"}</Badge> : <Badge variant="muted">Sem resposta</Badge>}
                        </li>
                      );
                    })}
                    {(!open ? l.votes : l.votes.filter((v) => !progress.eligible.some((e) => e.memberId === v.memberId))).map((v) => (
                      <li key={v.memberId} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">{v.name ?? "—"}</span>
                        <Badge variant={v.vote === "aprovado" ? "success" : "destructive"}>{v.vote === "aprovado" ? "Aprovou" : "Rejeitou"}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDateTime(v.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action?.kind === "cancelar" ? "Cancelar pedido" : "Rejeitar pedido de empréstimo"}</DialogTitle>
            <DialogDescription>
              {action
                ? action.kind === "cancelar"
                  ? `O pedido de ${formatMZN(action.loan.amount)} deixa de ser analisado. Fica registado no histórico.`
                  : `Uma rejeição encerra o pedido de ${formatMZN(action.loan.amount)} de ${action.loan.borrower_name}. O membro verá o motivo.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="loan-reason">{action?.kind === "cancelar" ? "Motivo (opcional)" : "Motivo *"}</Label>
            <Textarea id="loan-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={vote.isPending || cancel.isPending}
              onClick={() => {
                if (!action) return;
                if (action.kind === "cancelar") { cancel.mutate({ id: action.loan.id, reason: reason.trim() }); return; }
                if (reason.trim().length < 3) { toast.error("Indique o motivo (pelo menos 3 caracteres)."); return; }
                vote.mutate({ id: action.loan.id, approve: false, reason: reason.trim() });
              }}
            >
              {action?.kind === "cancelar" ? "Cancelar pedido" : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ===================== Definições (Diretor) ===================== */

export function LoanSettingsForm({ groupId, settings }: { groupId: string; settings: LoanSettings }) {
  const qc = useQueryClient();
  const [guaranteeRequired, setGuaranteeRequired] = useState(settings.guarantee_required);
  const [method, setMethod] = useState<string>(settings.interest_method ?? "nenhum");
  const save = useMutation({
    mutationFn: async (v: { days: number | null; method: string | null; rate: number | null }) => {
      const { error } = await supabase.rpc("set_group_loan_settings", {
        _group_id: groupId,
        _vote_deadline_days: v.days as number,
        _guarantee_required: guaranteeRequired,
        _interest_method: v.method as string,
        _interest_rate: v.rate as number,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regras de empréstimo guardadas. Aplicam-se aos novos pedidos.");
      qc.invalidateQueries({ queryKey: ["loan-settings", groupId] });
      qc.invalidateQueries({ queryKey: ["audit", groupId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const daysRaw = String(f.get("days") ?? "").trim();
    const days = daysRaw ? Number(daysRaw) : null;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 90)) { toast.error("O prazo de votação deve ter entre 1 e 90 dias (ou ficar vazio)."); return; }
    const m = method === "nenhum" ? null : method;
    let rate: number | null = null;
    if (m) {
      rate = parseRate(String(f.get("rate") ?? ""));
      if (rate === null) { toast.error("Indique a taxa de juros (0 a 100%, até 2 casas decimais)."); return; }
    }
    save.mutate({ days, method: m, rate });
  }

  return (
    <form onSubmit={onSubmit}>
      <Card className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-semibold">Regras de empréstimo</h2>
          <p className="mt-1 text-sm text-muted-foreground">Aplicam-se aos novos pedidos. Os pedidos já feitos mantêm os juros do momento em que foram enviados.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Método de juros</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger aria-label="Método de juros"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Ainda não definido</SelectItem>
                {(Object.keys(INTEREST_METHOD_LABEL) as InterestMethod[]).map((k) => (
                  <SelectItem key={k} value={k}>{INTEREST_METHOD_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {method !== "nenhum" ? <p className="text-xs text-muted-foreground">{INTEREST_METHOD_HINT[method as InterestMethod]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ls-rate">Taxa de juros (%)</Label>
            <Input id="ls-rate" name="rate" inputMode="decimal" disabled={method === "nenhum"}
              defaultValue={settings.interest_rate === null ? "" : String(settings.interest_rate).replace(".", ",")} placeholder="Ex.: 10" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ls-days">Prazo para a direção votar (dias)</Label>
          <Input id="ls-days" name="days" inputMode="numeric" className="sm:w-40" defaultValue={settings.vote_deadline_days ?? ""} placeholder="Sem prazo" />
          <p className="text-xs text-muted-foreground">Depois do prazo aparece um aviso; o pedido continua em análise até todos votarem.</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="ls-guarantee" className="font-semibold">Garantia obrigatória</Label>
            <p className="mt-1 text-sm text-muted-foreground">Quando ativa, o pedido exige a descrição e o documento ou fotografia da garantia.</p>
          </div>
          <Switch id="ls-guarantee" checked={guaranteeRequired} onCheckedChange={setGuaranteeRequired} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "A guardar…" : "Guardar regras de empréstimo"}</Button>
        </div>
      </Card>
    </form>
  );
}
