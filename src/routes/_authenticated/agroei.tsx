import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { platformGroupsQuery, platformOwnerQuery } from "@/lib/queries";
import { errorMessage, formatDate } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/agroei")({
  head: () => ({
    meta: [
      { title: "Área AGROEI — SMART POUPA" },
      { name: "description", content: "Gestão de grupos da plataforma SMART POUPA pela AGROEI." },
      { property: "og:title", content: "Área AGROEI — SMART POUPA" },
      { property: "og:description", content: "Gestão de grupos da plataforma SMART POUPA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    const isOwner = await context.queryClient.ensureQueryData(platformOwnerQuery(context.user.id));
    if (isOwner) await context.queryClient.ensureQueryData(platformGroupsQuery());
  },
  component: AgroeiPage,
});

function AgroeiPage() {
  const { user } = Route.useRouteContext();
  const { data: isOwner } = useSuspenseQuery(platformOwnerQuery(user.id));
  if (!isOwner) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">Sem acesso</h1>
        <p className="mt-1 text-sm text-muted-foreground">Esta área é reservada à AGROEI.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/painel">Voltar aos meus grupos</Link>
        </Button>
      </main>
    );
  }
  return <OwnerArea />;
}

function OwnerArea() {
  const { data: groups } = useSuspenseQuery(platformGroupsQuery());
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Área AGROEI"
        description="Crie grupos e atribua o primeiro Diretor. A AGROEI não consulta membros, dados pessoais nem movimentos dos grupos."
        actions={<NewGroupDialog />}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Grupos registados</p>
          <p className="mt-1 text-3xl font-bold">{groups.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Ativos</p>
          <p className="mt-1 text-3xl font-bold">{groups.filter((g) => g.status === "ativo").length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Suspensos</p>
          <p className="mt-1 text-3xl font-bold">{groups.filter((g) => g.status === "suspenso").length}</p>
        </Card>
      </div>
      {groups.length === 0 ? (
        <EmptyState title="Nenhum grupo criado">Use “Novo grupo” para criar o primeiro.</EmptyState>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Grupo</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Localidade</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Contacto oficial</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-3 font-semibold">{g.name}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{g.location ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {g.official_phone ?? g.official_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={g.status === "ativo" ? "success" : "muted"}>
                        {g.status === "ativo" ? "Ativo" : "Suspenso"}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{formatDate(g.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}

const groupSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome do grupo.").max(120),
  location: z.string().trim().max(160),
  official_phone: z.string().trim().max(30),
  official_email: z.union([z.literal(""), z.string().trim().email("Email oficial inválido.")]),
  director_name: z.string().trim().min(2, "Indique o nome do Diretor.").max(120),
  director_email: z.string().trim().email("Email do Diretor inválido."),
  director_phone: z.string().trim().max(30),
});

function NewGroupDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (v: z.infer<typeof groupSchema>) => {
      const { error } = await supabase.rpc("create_group", {
        _name: v.name,
        _location: v.location,
        _official_phone: v.official_phone,
        _official_email: v.official_email,
        _director_name: v.director_name,
        _director_email: v.director_email,
        _director_phone: v.director_phone,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grupo criado. O Diretor verá o convite ao entrar com o email indicado.");
      queryClient.invalidateQueries({ queryKey: ["platform-groups"] });
      setOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = groupSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Novo grupo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo grupo</DialogTitle>
          <DialogDescription>Dados do grupo e do primeiro Diretor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grupo</legend>
            <F id="g-name" name="name" label="Nome do grupo" required />
            <F id="g-loc" name="location" label="Localidade / sede" />
            <div className="grid gap-3 sm:grid-cols-2">
              <F id="g-phone" name="official_phone" label="Contacto oficial" type="tel" />
              <F id="g-email" name="official_email" label="Email oficial" type="email" />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Primeiro Diretor
            </legend>
            <F id="d-name" name="director_name" label="Nome completo" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <F id="d-email" name="director_email" label="Email" type="email" required />
              <F id="d-phone" name="director_phone" label="Contacto" type="tel" />
            </div>
            <p className="text-xs text-muted-foreground">
              O Diretor recebe acesso ao entrar na SMART POUPA com este email e aceitar o convite.
            </p>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "A criar…" : "Criar grupo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ id, label, ...props }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
