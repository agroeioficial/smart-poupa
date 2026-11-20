import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z
  .object({
    memberId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    origin: z.string().url().max(200),
  })
  .refine((v) => !!v.memberId !== !!v.groupId, "Indique o membro ou o grupo.");

function friendly(message: string) {
  if (/rate limit|too many/i.test(message)) return "Foram enviados demasiados emails. Aguarde um pouco e tente novamente.";
  if (/redirect/i.test(message)) return "O endereço da aplicação não está autorizado para convites. Contacte a AGROEI.";
  return message;
}

/**
 * Envia por email o convite de um membro cadastrado (Diretor ou Secretário do grupo),
 * ou o convite do primeiro Diretor de um grupo (AGROEI). Ao abrir o link, a pessoa
 * entra, o convite é aceite e só define a palavra-passe — nunca cria conta.
 */
export const sendMemberInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const origin = new URL(data.origin);
    if (origin.protocol !== "https:" && origin.hostname !== "localhost") throw new Error("Endereço inválido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let memberId = data.memberId ?? null;
    if (data.groupId) {
      const { data: owner } = await supabase.rpc("is_platform_owner", { _uid: userId });
      if (!owner) throw new Error("Apenas a AGROEI pode convidar o Diretor de um grupo.");
      const { data: dir } = await supabaseAdmin
        .from("group_members")
        .select("id, group_member_roles!inner(role)")
        .eq("group_id", data.groupId)
        .eq("status", "convidado")
        .eq("group_member_roles.role", "diretor")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!dir) throw new Error("O Diretor deste grupo já aceitou o convite.");
      memberId = dir.id;
    }

    const { data: member } = await supabaseAdmin
      .from("group_members")
      .select("id, group_id, status, user_id, full_name, groups(name)")
      .eq("id", memberId!)
      .maybeSingle();
    if (!member) throw new Error("Membro não encontrado.");
    if (data.memberId) {
      const { data: allowed } = await supabase.rpc("can_manage_members", { _uid: userId, _group: member.group_id });
      if (!allowed) throw new Error("Sem permissão para convidar membros neste grupo.");
    }
    if (member.status !== "convidado") throw new Error("Este membro já aceitou o convite.");

    const { data: priv } = await supabaseAdmin
      .from("member_private_data")
      .select("email")
      .eq("member_id", member.id)
      .maybeSingle();
    if (!priv?.email) throw new Error("O membro não tem email registado.");

    const redirectTo = `${origin.origin}/convite`;
    let kind: "novo" | "existente" = "novo";
    if (member.user_id) {
      kind = "existente";
    } else {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(priv.email, {
        redirectTo,
        data: { full_name: member.full_name, needs_password: true },
      });
      if (error) {
        if (!/already been registered|already registered|exists/i.test(error.message)) throw new Error(friendly(error.message));
        kind = "existente";
      }
    }
    if (kind === "existente") {
      const { error } = await supabaseAdmin.auth.signInWithOtp({
        email: priv.email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });
      if (error) throw new Error(friendly(error.message));
    }

    await supabaseAdmin.from("audit_log").insert({
      group_id: member.group_id,
      actor_id: userId,
      action: "convite_enviado",
      entity: "group_member",
      entity_id: member.id,
    });
    return { sent: true, kind };
  });
