import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GroupRole, MemberStatus } from "./roles";

export type Membership = {
  id: string;
  group_id: string;
  status: MemberStatus;
  full_name: string;
  joined_at: string | null;
  roles: GroupRole[];
  group: { id: string; name: string; location: string | null } | null;
};

export const myMembershipsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["memberships", userId],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("group_members")
        .select("id, group_id, status, full_name, joined_at, groups(id, name, location), group_member_roles(role)")
        .eq("user_id", userId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id,
        group_id: m.group_id,
        status: m.status,
        full_name: m.full_name,
        joined_at: m.joined_at,
        group: m.groups,
        roles: (m.group_member_roles ?? []).map((r) => r.role),
      }));
    },
  });

export const platformOwnerQuery = (userId: string) =>
  queryOptions({
    queryKey: ["platform-owner", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "agroei_owner")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

export const groupQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.from("groups").select("*").eq("id", groupId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const PAGE_SIZE = 20;

export type MemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  profession: string | null;
  status: MemberStatus;
  user_id: string | null;
  joined_at: string | null;
  created_at: string;
  roles: GroupRole[];
};

export const membersQuery = (groupId: string, search: string, status: MemberStatus | "todos", page: number) =>
  queryOptions({
    queryKey: ["members", groupId, search, status, page],
    queryFn: async () => {
      let q = supabase
        .from("group_members")
        .select("id, full_name, phone, profession, status, user_id, joined_at, created_at, group_member_roles(role)", {
          count: "exact",
        })
        .eq("group_id", groupId);
      if (search.trim()) q = q.ilike("full_name", `%${search.trim().replace(/[%_]/g, "")}%`);
      if (status !== "todos") q = q.eq("status", status);
      const from = page * PAGE_SIZE;
      const { data, error, count } = await q.order("full_name").range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows: MemberRow[] = (data ?? []).map((m) => ({
        id: m.id,
        full_name: m.full_name,
        phone: m.phone,
        profession: m.profession,
        status: m.status,
        user_id: m.user_id,
        joined_at: m.joined_at,
        created_at: m.created_at,
        roles: (m.group_member_roles ?? []).map((r) => r.role),
      }));
      return { rows, total: count ?? 0 };
    },
  });

export const memberPrivateQuery = (memberId: string) =>
  queryOptions({
    queryKey: ["member-private", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_private_data")
        .select("email, id_document_type, id_document_number, birth_date, address")
        .eq("member_id", memberId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const groupStatsQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["group-stats", groupId],
    queryFn: async () => {
      const count = async (status: MemberStatus) => {
        const { count, error } = await supabase
          .from("group_members")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("status", status);
        if (error) throw error;
        return count ?? 0;
      };
      const [ativo, convidado, suspenso] = await Promise.all([count("ativo"), count("convidado"), count("suspenso")]);
      return { ativo, convidado, suspenso };
    },
  });

export const auditQuery = (groupId: string, page: number) =>
  queryOptions({
    queryKey: ["audit", groupId, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("audit_log")
        .select("id, action, entity, entity_id, details, created_at, actor_id", { count: "exact" })
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

export const platformGroupsQuery = () =>
  queryOptions({
    queryKey: ["platform-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, location, official_phone, official_email, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
