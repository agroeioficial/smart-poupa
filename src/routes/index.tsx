import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Users, HandCoins, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SMART POUPA — Gestão de grupos de poupança | AGROEI" },
      {
        name: "description",
        content:
          "Plataforma da AGROEI para gerir grupos de poupança com organização, transparência e total separação entre grupos.",
      },
      { property: "og:title", content: "SMART POUPA — Gestão de grupos de poupança" },
      {
        property: "og:description",
        content: "Organização, transparência e separação total entre grupos de poupança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Cada grupo no seu espaço",
    text: "Os dados de um grupo nunca são visíveis a outro grupo.",
  },
  {
    icon: Users,
    title: "Papéis claros",
    text: "Diretor, Tesoureiro, Secretário e Membro, cada um com as suas permissões.",
  },
  {
    icon: HandCoins,
    title: "O dinheiro fica com o grupo",
    text: "A SMART POUPA regista e organiza. Não recebe nem movimenta dinheiro.",
  },
];

function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        {signedIn ? (
          <Button asChild size="sm">
            <Link to="/painel">Abrir painel</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link to="/auth">Entrar</Link>
          </Button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="max-w-2xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-secondary-foreground">
            <span className="size-1.5 rounded-full bg-gold" /> Grupos de poupança em Moçambique
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.08] text-foreground sm:text-6xl">
            A poupança do grupo, organizada e transparente.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            A SMART POUPA ajuda a comissão diretiva e os membros a acompanhar o grupo com clareza, a partir do
            telemóvel, tablet ou computador.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/painel" : "/auth"}>
                {signedIn ? "Abrir painel" : "Entrar ou criar conta"} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[220px] sm:max-w-[300px] lg:max-w-[380px]">
          <img
            src="/icons/icon-512.png"
            alt="Ícone SMART POUPA: frasco de moedas seguro por duas mãos"
            width={512}
            height={512}
            className="aspect-square w-full rounded-[28%] shadow-card"
          />
        </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="rounded-xl border bg-card p-5 shadow-card">
              <span className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <p.icon className="size-[18px]" />
              </span>
              <h2 className="font-semibold text-foreground">{p.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} AGROEI — Agropecuária e Empreendedorismo Inovadores</span>
          <span>SMART POUPA</span>
        </div>
      </footer>
    </div>
  );
}
