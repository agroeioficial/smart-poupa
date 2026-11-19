import { describe, expect, it } from "vitest";
import {
  allowedStatusRequests,
  approvalProgress,
  canEditSettings,
  canManageMembers,
  canProposeRoles,
  canSeePrivateData,
  isAdmin,
  isRecordIncomplete,
  type GroupRole,
} from "@/lib/roles";

// Regras do Manual Mestre (secção 4) e decisões da AGROEI de 18/11/2026.
// A base de dados aplica as mesmas regras; estes testes cobrem a interface.
describe("Papéis do grupo", () => {
  it("Diretor, Tesoureiro e Secretário são administradores; Membro não", () => {
    expect(isAdmin(["diretor"])).toBe(true);
    expect(isAdmin(["tesoureiro"])).toBe(true);
    expect(isAdmin(["secretario"])).toBe(true);
    expect(isAdmin(["membro"])).toBe(false);
  });

  it("só Diretor e Secretário cadastram membros", () => {
    expect(canManageMembers(["diretor"])).toBe(true);
    expect(canManageMembers(["secretario"])).toBe(true);
    expect(canManageMembers(["tesoureiro"])).toBe(false);
    expect(canManageMembers(["membro"])).toBe(false);
  });

  it("Secretário e Tesoureiro veem dados sensíveis; Membro não", () => {
    expect(canSeePrivateData(["secretario"])).toBe(true);
    expect(canSeePrivateData(["tesoureiro"])).toBe(true);
    expect(canSeePrivateData(["membro"])).toBe(false);
  });

  it("só o Diretor altera definições", () => {
    expect(canEditSettings(["diretor"])).toBe(true);
    expect(canEditSettings(["tesoureiro"])).toBe(false);
  });

  it("qualquer administrador propõe cargos, nunca para si próprio", () => {
    expect(canProposeRoles({ myRoles: ["tesoureiro"], targetStatus: "ativo", isSelf: false })).toBe(true);
    expect(canProposeRoles({ myRoles: ["diretor"], targetStatus: "ativo", isSelf: true })).toBe(false);
    expect(canProposeRoles({ myRoles: ["membro"], targetStatus: "ativo", isSelf: false })).toBe(false);
  });
});

describe("Pedidos de alteração de estado", () => {
  it("qualquer administrador pode pedir suspensão ou exclusão", () => {
    expect(allowedStatusRequests({ myRoles: ["tesoureiro"], targetStatus: "ativo", isSelf: false })).toEqual(["suspenso", "excluido"]);
  });
  it("ninguém pede a alteração do próprio estado", () => {
    expect(allowedStatusRequests({ myRoles: ["diretor"], targetStatus: "ativo", isSelf: true })).toEqual([]);
  });
  it("Membro não faz pedidos", () => {
    expect(allowedStatusRequests({ myRoles: ["membro"], targetStatus: "ativo", isSelf: false })).toEqual([]);
  });
  it("membro excluído não pode ser reativado", () => {
    expect(allowedStatusRequests({ myRoles: ["diretor"], targetStatus: "excluido", isSelf: false })).toEqual([]);
  });
  it("membro suspenso pode ser reativado ou excluído", () => {
    expect(allowedStatusRequests({ myRoles: ["secretario"], targetStatus: "suspenso", isSelf: false })).toEqual(["ativo", "excluido"]);
  });
});

const adm = (id: string, ...roles: GroupRole[]) => ({ memberId: id, roles });

describe("Aprovação da direção", () => {
  it("único administrador decide sozinho", () => {
    expect(approvalProgress({ eligible: [adm("d", "diretor")], approvals: ["d"], rejected: false }).state).toBe("aprovado");
  });
  it("com dois administradores, os dois aprovam", () => {
    const eligible = [adm("d", "diretor"), adm("s", "secretario")];
    expect(approvalProgress({ eligible, approvals: ["d"], rejected: false }).state).toBe("pendente");
    expect(approvalProgress({ eligible, approvals: ["d", "s"], rejected: false }).state).toBe("aprovado");
  });
  it("com três, aprovam os três principais", () => {
    const eligible = [adm("d", "diretor"), adm("t", "tesoureiro"), adm("s", "secretario")];
    expect(approvalProgress({ eligible, approvals: ["d", "s"], rejected: false }).state).toBe("pendente");
    expect(approvalProgress({ eligible, approvals: ["d", "t", "s"], rejected: false }).state).toBe("aprovado");
  });
  it("com quatro ou mais, bastam os três principais", () => {
    const eligible = [adm("d", "diretor"), adm("t", "tesoureiro"), adm("s", "secretario"), adm("s2", "secretario")];
    expect(approvalProgress({ eligible, approvals: ["d", "t", "s"], rejected: false }).state).toBe("aprovado");
    const semTesoureiro = approvalProgress({ eligible, approvals: ["d", "s", "s2"], rejected: false });
    expect(semTesoureiro.state).toBe("pendente");
    expect(semTesoureiro.missingRoles).toEqual(["tesoureiro"]);
  });
  it("uma rejeição rejeita o pedido", () => {
    expect(approvalProgress({ eligible: [adm("d", "diretor"), adm("t", "tesoureiro")], approvals: ["d"], rejected: true }).state).toBe("rejeitado");
  });
});

describe("Cadastro obrigatório", () => {
  const full = { phone: "84", profession: "Agricultor", id_document_type: "BI", id_document_number: "1", birth_date: "1990-01-01", address: "Rua" };
  it("cadastro completo não fica marcado", () => {
    expect(isRecordIncomplete(full)).toBe(false);
  });
  it("falta de qualquer campo marca o cadastro como incompleto", () => {
    expect(isRecordIncomplete({ ...full, address: "" })).toBe(true);
    expect(isRecordIncomplete({ ...full, birth_date: null })).toBe(true);
  });
});
