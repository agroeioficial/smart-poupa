import { describe, expect, it } from "vitest";
import { showMyGroups, singleGroupId } from "@/lib/navigation";
import type { Membership } from "@/lib/queries";

const m = (group_id: string, status: Membership["status"]): Membership => ({
  id: "m-" + group_id,
  group_id,
  status,
  full_name: "Pessoa",
  joined_at: null,
  roles: ["membro"],
  group: { id: group_id, name: "Grupo " + group_id, location: null },
});

// Pedido da AGROEI (20/11/2026): "Os meus grupos" só para quem está em mais de um grupo; nunca para a AGROEI.
describe("Menu Os meus grupos", () => {
  it("a AGROEI nunca vê o menu", () => {
    expect(showMyGroups([m("a", "ativo"), m("b", "ativo")], true)).toBe(false);
  });
  it("membro de um só grupo não vê o menu e entra direto no grupo", () => {
    expect(showMyGroups([m("a", "ativo")], false)).toBe(false);
    expect(singleGroupId([m("a", "ativo")])).toBe("a");
  });
  it("membro de dois grupos vê o menu", () => {
    expect(showMyGroups([m("a", "ativo"), m("b", "ativo")], false)).toBe(true);
    expect(singleGroupId([m("a", "ativo"), m("b", "ativo")])).toBeNull();
  });
  it("grupo de onde foi excluído não conta", () => {
    expect(showMyGroups([m("a", "ativo"), m("b", "excluido")], false)).toBe(false);
    expect(singleGroupId([m("a", "ativo"), m("b", "excluido")])).toBe("a");
  });
});
