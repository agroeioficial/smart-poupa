import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app/AppHeader";

// A sessão vive no navegador: esta área é renderizada só no cliente e protegida antes de carregar.
// A proteção real dos dados está nas políticas RLS da base de dados.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const name = (user.user_metadata?.["full_name"] as string | undefined) ?? "";
  return (
    <div className="min-h-screen">
      <AppHeader userId={user.id} email={user.email ?? ""} name={name} />
      <Outlet />
    </div>
  );
}
