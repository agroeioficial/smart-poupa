import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// Envia a sessão do navegador às funções do servidor protegidas (requireSupabaseAuth valida-a no servidor).
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
