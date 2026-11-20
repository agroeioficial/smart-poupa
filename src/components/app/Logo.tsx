import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/icons/logo-160.webp"
      alt=""
      width={36}
      height={36}
      className={cn("size-9 shrink-0 rounded-[10px] shadow-card", className)}
    />
  );
}

export function Logo({ to = "/", className, light = false }: { to?: "/" | "/painel" | "/agroei"; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn("flex items-center gap-2.5", className)} aria-label="SMART POUPA — início">
      <LogoMark />
      <span className="leading-none">
        <span className={cn("block text-[15px] font-extrabold tracking-tight", light ? "text-primary-foreground" : "text-foreground")}>
          SMART POUPA
        </span>
        <span
          className={cn(
            "block text-[10px] font-medium uppercase tracking-[0.14em]",
            light ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          por AGROEI
        </span>
      </span>
    </Link>
  );
}
