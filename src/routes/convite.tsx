import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, MailWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/app/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/convite")({
  head: () => ({
    meta: [
      { title: "Aceitar convite — SMART POUPA" },
      { name: "description", content: "Aceite o convite do seu grupo de poupança e defina a sua palavra-passe." },
      { property: "og:title", content: "Aceitar convite — SMART POUPA" },
      { property: "og:description", content: "Aceite o convite do seu grupo de poupança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

const passwordSchema = z
  .object({
    password: z.string().min(8, "A palavra-passe deve ter pelo menos 8 caracteres.").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As palavras-passe não coincidem.", path: ["confirm"] });

type Stage = "loading" | "password" | "invalid";

async function acceptPendingInvites(userId: string) {
  const { data } = await supabase.from("group_members").select("id").eq("user_id", userId).eq("status", "convidado");
  for (const m of data ?? []) {
    const { error } = await supabase.rpc("accept_invitation", { _member_id: m.id });
    if (error) throw error;
  }
}

function InvitePage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("loading");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let done = false;
    async function run() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (hash.get("error")) { setStage("invalid"); return; }
      // O cliente lê a sessão do link; aguardamos um pouco se ainda estiver a processar.
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; !session && i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (done) return;
      if (!session) { setStage("invalid"); return; }
      const user = session.user;
      setName(((user.user_metadata?.["full_name"] as string | undefined) ?? "").split(" ")[0] ?? "");
      try {
        await acceptPendingInvites(user.id);
      } catch (e) {
        toast.error(errorMessage(e));
      }
      if (user.user_metadata?.["needs_password"]) setStage("password");
      else navigate({ to: "/painel", replace: true });
    }
    run();
    return () => { done = true; };
  }, [navigate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password, data: { needs_password: false } });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Palavra-passe definida. Bem-vindo ao grupo!");
    navigate({ to: "/painel", replace: true });
  }

  if (stage === "loading") {
    return (
      <AuthShell title="A aceitar o convite…">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Um momento.
        </div>
      </AuthShell>
    );
  }

  if (stage === "invalid") {
    return (
      <AuthShell title="Link inválido ou expirado">
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <MailWarning className="mb-3 size-6 text-muted-foreground" />
          <p className="text-sm text-foreground">
            Este link de convite já foi usado ou expirou. Peça ao Diretor ou ao Secretário do seu grupo para reenviar o convite.
          </p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => navigate({ to: "/auth" })}>
            Já tenho palavra-passe — entrar
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={name ? `Bem-vindo, ${name}` : "Bem-vindo"}
      subtitle="O seu convite foi aceite. Defina a palavra-passe que vai usar para entrar."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-pass">Palavra-passe</Label>
          <Input id="inv-pass" name="password" type="password" autoComplete="new-password" required className="h-10" />
          <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-confirm">Confirmar palavra-passe</Label>
          <Input id="inv-confirm" name="confirm" type="password" autoComplete="new-password" required className="h-10" />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "A guardar…" : "Confirmar e entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}
