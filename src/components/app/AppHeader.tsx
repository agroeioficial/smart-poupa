import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { LogOut, LayoutGrid, Building2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { myMembershipsQuery, platformOwnerQuery } from "@/lib/queries";
import { showMyGroups } from "@/lib/navigation";
import { initials } from "@/lib/format";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader({ userId, email, name }: { userId: string; email: string; name: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: isOwner } = useQuery(platformOwnerQuery(userId));
  const { data: memberships } = useQuery(myMembershipsQuery(userId));
  const myGroups = showMyGroups(memberships ?? [], !!isOwner);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const display = name || email;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo to={isOwner ? "/agroei" : "/painel"} />
        <div className="flex items-center gap-1">
          {myGroups ? (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/painel" activeProps={{ className: "bg-accent text-accent-foreground" }}>
                <LayoutGrid /> Os meus grupos
              </Link>
            </Button>
          ) : null}
          {isOwner ? (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/agroei" activeProps={{ className: "bg-accent text-accent-foreground" }}>
                <Building2 /> Área AGROEI
              </Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 pl-1.5" aria-label="Menu da conta">
                <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                  {initials(display) || "?"}
                </span>
                <ChevronDown className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate font-semibold">{name || "A minha conta"}</span>
                <span className="block truncate text-xs text-muted-foreground">{email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {myGroups ? (
                <DropdownMenuItem asChild>
                  <Link to="/painel">
                    <LayoutGrid /> Os meus grupos
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {isOwner ? (
                <DropdownMenuItem asChild>
                  <Link to="/agroei">
                    <Building2 /> Área AGROEI
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut}>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
