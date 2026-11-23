import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { groupQuery } from "@/lib/queries";
import { useGroupAccess } from "@/lib/use-group-access";
import { canEditSettings } from "@/lib/roles";
import { errorMessage } from "@/lib/format";
import { loanSettingsQuery } from "@/lib/loan-queries";
import { PageHeader } from "@/components/app/PageHeader";
import { LoanSettingsForm } from "@/components/app/LoanParts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/grupo/$groupId/definicoes")({
  head: () => ({
    meta: [
      { title: "Definições do grupo — SMART POUPA" },
      { name: "description", content: "Dados oficiais e privacidade do grupo de poupança." },
      { property: "og:title", content: "Definições do grupo — SMART POUPA" },
      { property: "og:description", content: "Dados oficiais e privacidade do grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Indique o nome do grupo.").max(120),
  location: z.string().trim().max(160),
  official_phone: z.string().trim().max(30),
  official_email: z.union([z.literal(""), z.string().trim().email("Email oficial inválido.")]),
});

function SettingsPage() {
  const { groupId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data: group } = useSuspenseQuery(groupQuery(groupId));
  const { roles } = useGroupAccess(user.id, groupId);
  const queryClient = useQueryClient();
  const [directory, setDirectory] = useState(group?.member_directory_visible ?? false);
  const loanSettings = useQuery(loanSettingsQuery(groupId));

  const save = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const { error } = await supabase.rpc("update_group_settings", {
        _group_id: groupId,
        _name: v.name,
        _location: v.location,
        _official_phone: v.official_phone,
        _official_email: v.official_email,
        _member_directory_visible: directory,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Definições guardadas.");
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      queryClient.invalidateQueries({ queryKey: ["audit", groupId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!group) return null;
  if (!canEditSettings(roles)) {
    return <p className="text-sm text-muted-foreground">Apenas o Diretor pode alterar as definições do grupo.</p>;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    save.mutate(parsed.data);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Definições" description="Dados oficiais, privacidade e regras de empréstimo do grupo." />
      <form onSubmit={onSubmit} className="space-y-4">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold">Dados do grupo</h2>
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Nome do grupo</Label>
            <Input id="s-name" name="name" defaultValue={group.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-loc">Localidade / sede</Label>
            <Input id="s-loc" name="location" defaultValue={group.location ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-phone">Contacto oficial</Label>
              <Input id="s-phone" name="official_phone" type="tel" defaultValue={group.official_phone ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-email">Email oficial</Label>
              <Input id="s-email" name="official_email" type="email" defaultValue={group.official_email ?? ""} />
            </div>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="s-dir" className="text-base font-semibold">
                Lista de membros visível aos membros
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Quando ativa, os membros ativos veem o nome, contacto e profissão uns dos outros. Documentos e outros
                dados sensíveis nunca são mostrados.
              </p>
            </div>
            <Switch id="s-dir" checked={directory} onCheckedChange={setDirectory} />
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "A guardar…" : "Guardar definições"}
          </Button>
        </div>
      </form>
      <div className="mt-8">
        {loanSettings.data ? <LoanSettingsForm key={JSON.stringify(loanSettings.data)} groupId={groupId} settings={loanSettings.data} /> : <Skeleton className="h-64 rounded-xl" />}
      </div>
    </div>
  );
}
