import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DepositStatus, PaymentChannel } from "./finance";

export type SavingsRow = { scope: "individual" | "coletivo"; target_id: string; label: string; confirmed: number; pending: number };

export const mySavingsQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["my-savings", groupId],
    queryFn: async (): Promise<SavingsRow[]> => {
      const { data, error } = await supabase.rpc("my_savings", { _group_id: groupId });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, scope: r.scope as SavingsRow["scope"], confirmed: Number(r.confirmed), pending: Number(r.pending) }));
    },
  });

export const groupSavingsQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["group-savings", groupId],
    queryFn: async (): Promise<SavingsRow[]> => {
      const { data, error } = await supabase.rpc("group_savings", { _group_id: groupId });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, scope: r.scope as SavingsRow["scope"], confirmed: Number(r.confirmed), pending: Number(r.pending) }));
    },
  });

export const paymentAccountsQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["payment-accounts", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_payment_accounts")
        .select("id, channel, institution, account_number, holder_name, active")
        .eq("group_id", groupId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

export type DepositRow = {
  id: string;
  member_id: string | null;
  collective_profile_id: string | null;
  submitted_by: string;
  submitted_by_member: string;
  amount: number;
  deposit_date: string;
  channel: PaymentChannel;
  transaction_ref: string;
  receipt_path: string;
  notes: string | null;
  status: DepositStatus;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  target_name: string;
  submitter_name: string | null;
  reviewer_name: string | null;
  account: { channel: PaymentChannel; institution: string | null; account_number: string } | null;
  reversal: { reason: string | null; created_at: string } | null;
};

export const DEPOSITS_PAGE = 25;

/** Depósitos visíveis ao utilizador (RLS: os seus, os do seu perfil coletivo, ou todos se for Diretor/Tesoureiro). */
export const depositsQuery = (groupId: string, status: DepositStatus | "todos", page: number, onlyMine?: { userId: string; memberId: string; profileId: string | null }) =>
  queryOptions({
    queryKey: ["deposits", groupId, status, page, onlyMine?.memberId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("deposits")
        .select(
          `id, member_id, collective_profile_id, submitted_by, submitted_by_member, amount, deposit_date, channel, transaction_ref,
           receipt_path, notes, status, reviewed_at, rejection_reason, created_at,
           target:group_members!deposits_member_id_fkey(full_name),
           profile:collective_profiles(name),
           submitter:group_members!deposits_submitted_by_member_fkey(full_name),
           reviewer:group_members!deposits_reviewed_by_member_fkey(full_name),
           account:group_payment_accounts(channel, institution, account_number),
           savings_ledger(kind, reason, created_at)`,
          { count: "exact" },
        )
        .eq("group_id", groupId);
      if (status !== "todos") q = q.eq("status", status);
      if (onlyMine) {
        const parts = [`member_id.eq.${onlyMine.memberId}`, `submitted_by.eq.${onlyMine.userId}`];
        if (onlyMine.profileId) parts.push(`collective_profile_id.eq.${onlyMine.profileId}`);
        q = q.or(parts.join(","));
      }
      const from = page * DEPOSITS_PAGE;
      const { data, error, count } = await q
        .order("created_at", { ascending: status === "pendente" })
        .range(from, from + DEPOSITS_PAGE - 1);
      if (error) throw error;
      const rows: DepositRow[] = (data ?? []).map((d) => {
        const rev = (d.savings_ledger ?? []).find((l) => l.kind === "estorno");
        return {
          id: d.id,
          member_id: d.member_id,
          collective_profile_id: d.collective_profile_id,
          submitted_by: d.submitted_by,
          submitted_by_member: d.submitted_by_member,
          amount: Number(d.amount),
          deposit_date: d.deposit_date,
          channel: d.channel,
          transaction_ref: d.transaction_ref,
          receipt_path: d.receipt_path,
          notes: d.notes,
          status: d.status,
          reviewed_at: d.reviewed_at,
          rejection_reason: d.rejection_reason,
          created_at: d.created_at,
          target_name: d.profile?.name ?? d.target?.full_name ?? "—",
          submitter_name: d.submitter?.full_name ?? null,
          reviewer_name: d.reviewer?.full_name ?? null,
          account: d.account,
          reversal: rev ? { reason: rev.reason, created_at: rev.created_at } : null,
        };
      });
      return { rows, total: count ?? 0 };
    },
  });
