import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/app/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — SMART POUPA" },
      { name: "description", content: "Entre na sua conta SMART POUPA." },
      { property: "og:title", content: "Entrar — SMART POUPA" },
      { property: "og:description", content: "Entre na sua conta SMART POUPA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Indique um email válido.").max(255);
const passwordSchema = z.string().min(8, "A palavra-passe deve ter pelo menos 8 caracteres.").max(72);
type Mode = "entrar" | "recuperar";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("entrar");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  async function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = emailSchema.safeParse(f.get("email"));
    if (!email.success) { toast.error(email.error.issues[0]?.message ?? "Dados inválidos."); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: String(f.get("password") ?? "") });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    navigate({ to: "/painel", replace: true });
  }

  async function onRecover(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = emailSchema.safeParse(new FormData(e.currentTarget).get("email"));
    if (!email.success) { toast.error(email.error.issues[0]?.message ?? "Dados inválidos."); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    setSentTo({ email: email.data });
  }

  if (sentTo) {
    return (
      <AuthShell title="Verifique o seu email">
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <MailCheck className="mb-3 size-6 text-primary" />
          <p className="text-sm text-foreground">
            Se existir uma conta, enviámos um link para definir nova palavra-passe para{" "}
            <strong>{sentTo.email}</strong>.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Abra o link no mesmo dispositivo para continuar.</p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => { setSentTo(null); setMode("entrar"); }}>
            Voltar a entrar
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (mode === "recuperar") {
    return (
      <AuthShell title="Recuperar palavra-passe" subtitle="Indique o email da sua conta.">
        <form onSubmit={onRecover} className="space-y-4">
          <Field id="rec-email" label="Email" name="email" type="email" autoComplete="email" />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "A enviar…" : "Enviar link"}
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={() => setMode("entrar")}>
            Voltar
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Bem-vindo à SMART POUPA" subtitle="Entre com a sua conta individual.">
      <form onSubmit={onSignIn} className="space-y-4">
        <Field id="in-email" label="Email" name="email" type="email" autoComplete="email" />
        <Field id="in-pass" label="Palavra-passe" name="password" type="password" autoComplete="current-password" />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "A entrar…" : "Entrar"}
        </Button>
        <Button type="button" variant="link" className="w-full" onClick={() => setMode("recuperar")}>
          Esqueci-me da palavra-passe
        </Button>
      </form>
      <p className="mt-6 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Não é possível criar conta aqui. A direção do seu grupo faz o cadastro e o convite chega ao seu email: abra-o para
        aceitar e definir a palavra-passe.
      </p>
    </AuthShell>
  );
}

function Field({
  id,
  label,
  hint,
  required = true,
  ...props
}: { id: string; label: string; hint?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required={required} className="h-10" {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
