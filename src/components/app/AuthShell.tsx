import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-brand p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 rounded-xl" />
          <span className="text-sm font-semibold uppercase tracking-[0.16em] opacity-80">SMART POUPA · AGROEI</span>
        </div>
        <div>
          <p className="font-display text-4xl font-semibold leading-tight">
            Transparência para quem poupa em grupo.
          </p>
          <p className="mt-4 max-w-sm text-sm opacity-80">
            Cada pessoa usa a sua própria conta. Cada grupo vê apenas os seus dados.
          </p>
        </div>
        <span className="text-xs opacity-70">O dinheiro é transferido diretamente entre os membros e o grupo.</span>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
