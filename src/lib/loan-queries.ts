import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InterestMethod, LoanStatus } from "./loans";

export type LoanSettings = {
  vote_deadline_days: number | null;
  guarantee_required: boolean;
  interest_method: InterestMethod | null;
  interest_rate: number | null;
};

export const DEFAULT_LOAN_SETTINGS: LoanSettings = {
  vote_deadline_days: null,
  guarantee_required: false,
  interest_method: null,
  interest_rate: null,
};

/** Regras de empréstimo do grupo (visíveis aos membros ativos). */
export const loanSettingsQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["loan-settings", groupId],
    queryFn: async (): Promise<LoanSettings> => {
      const { data, error } = await supabase
        .from("group_loan_settings")
        .select("vote_deadline_days, guarantee_required, interest_method, interest_rate")
        .eq("group_id", groupId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_LOAN_SETTINGS;
      return {
        vote_deadline_days: data.vote_deadline_days,
        guarantee_required: data.guarantee_required,
        interest_method: data.interest_method as InterestMethod | null,
        interest_rate: data.interest_rate === null ? null : Number(data.interest_rate),
      };
    },
  });

export type LoanVote = { memberId: string; name: string | null; vote: "aprovado" | "rejeitado"; reason: string | null; created_at: string };

export type LoanRow = {
  id: string;
  member_id: string;
  borrower_name: string;
  amount: number;
  term_months: number;
  purpose: string;
  guarantee_description: string | null;
  guarantee_path: string | null;
  declaration_path: string;
  interest_method: InterestMethod | null;
  interest_rate: number | null;
  status: LoanStatus;
  decided_at: string | null;
  rejection_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
  votes: LoanVote[];
};

export type LoanScope = "abertos" | "historico" | { memberId: string };

/**
 * Pedidos visíveis ao utilizador (RLS: os seus, ou todos os do grupo se for da direção).
 * Os votos só chegam à direção.
 */
export const loansQuery = (groupId: string, scope: LoanScope) =>
  queryOptions({
    queryKey: ["loans", groupId, typeof scope === "string" ? scope : scope.memberId],
    queryFn: async (): Promise<LoanRow[]> => {
      let q = supabase
        .from("loans")
        .select(
          `id, member_id, amount, term_months, purpose, guarantee_description, guarantee_path, declaration_path,
           interest_method, interest_rate, status, decided_at, rejection_reason, cancel_reason, created_at,
           borrower:group_members!loans_member_id_fkey(full_name),
           loan_votes(voter_member_id, vote, reason, created_at, voter:group_members!loan_votes_voter_member_id_fkey(full_name))`,
        )
        .eq("group_id", groupId);
      if (scope === "abertos") q = q.in("status", ["submetido", "em_analise"]);
      else if (scope === "historico") q = q.not("status", "in", "(submetido,em_analise)");
      else q = q.eq("member_id", scope.memberId);
      const { data, error } = await q.order("created_at", { ascending: scope === "abertos" }).limit(200);
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id,
        member_id: l.member_id,
        borrower_name: l.borrower?.full_name ?? "—",
        amount: Number(l.amount),
        term_months: l.term_months,
        purpose: l.purpose,
        guarantee_description: l.guarantee_description,
        guarantee_path: l.guarantee_path,
        declaration_path: l.declaration_path,
        interest_method: l.interest_method as InterestMethod | null,
        interest_rate: l.interest_rate === null ? null : Number(l.interest_rate),
        status: l.status,
        decided_at: l.decided_at,
        rejection_reason: l.rejection_reason,
        cancel_reason: l.cancel_reason,
        created_at: l.created_at,
        votes: (l.loan_votes ?? []).map((v) => ({
          memberId: v.voter_member_id,
          name: v.voter?.full_name ?? null,
          vote: v.vote,
          reason: v.reason,
          created_at: v.created_at,
        })),
      }));
    },
  });
