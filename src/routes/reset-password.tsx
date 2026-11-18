import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/app/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova palavra-passe — SMART POUPA" },
      { name: "description", content: "Defina uma nova palavra-passe para a sua conta SMART POUPA." },
      { property: "og:title", content: "Nova palavra-passe — SMART POUPA" },
      { property: "og:description", content: "Defina uma nova palavra-passe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && isRecovery)) setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password.length < 8) { toast.error("A palavra-passe deve ter pelo menos 8 caracteres."); return; }
    if (password !== String(f.get("confirm") ?? "")) { toast.error("As palavras-passe não coincidem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Palavra-passe atualizada.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <AuthShell title="Definir nova palavra-passe">
      {ready ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="np">Nova palavra-passe</Label>
            <Input id="np" name="password" type="password" autoComplete="new-password" required className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="npc">Confirmar palavra-passe</Label>
            <Input id="npc" name="confirm" type="password" autoComplete="new-password" required className="h-10" />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "A guardar…" : "Guardar"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Abra esta página através do link enviado para o seu email. Se o link expirou, peça um novo na página de
          entrada.
        </p>
      )}
    </AuthShell>
  );
}
