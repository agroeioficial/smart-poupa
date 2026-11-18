import { describe, expect, it } from "vitest";
import { allowedStatusChanges, canAssignRoles, canEditSettings, canManageMembers, isAdmin } from "@/lib/roles";

// Regras do Manual Mestre (secção 4). A base de dados aplica as mesmas regras; estes testes cobrem a interface.
describe("Papéis do grupo", () => {
  it("Diretor, Tesoureiro e Secretário são administradores; Membro não", () => {
    expect(isAdmin(["diretor"])).toBe(true);
    expect(isAdmin(["tesoureiro"])).toBe(true);
    expect(isAdmin(["secretario"])).toBe(true);
    expect(isAdmin(["membro"])).toBe(false);
  });

  it("só Diretor e Secretário gerem o cadastro de membros", () => {
    expect(canManageMembers(["diretor"])).toBe(true);
    expect(canManageMembers(["secretario"])).toBe(true);
    expect(canManageMembers(["tesoureiro", "membro"])).toBe(false);
    expect(canManageMembers(["membro"])).toBe(false);
  });

  it("só o Diretor atribui papéis e altera definições", () => {
    expect(canAssignRoles(["diretor"])).toBe(true);
    expect(canAssignRoles(["secretario"])).toBe(false);
    expect(canEditSettings(["diretor"])).toBe(true);
    expect(canEditSettings(["tesoureiro"])).toBe(false);
  });
});

describe("Alteração de estado de membros", () => {
  it("ninguém altera o próprio estado", () => {
    expect(allowedStatusChanges({ myRoles: ["diretor"], targetRoles: ["membro"], targetStatus: "ativo", isSelf: true })).toEqual([]);
  });

  it("Secretário não altera o estado de um administrador", () => {
    expect(allowedStatusChanges({ myRoles: ["secretario"], targetRoles: ["tesoureiro"], targetStatus: "ativo", isSelf: false })).toEqual([]);
  });

  it("membro excluído não pode ser reativado", () => {
    expect(allowedStatusChanges({ myRoles: ["diretor"], targetRoles: ["membro"], targetStatus: "excluido", isSelf: false })).toEqual([]);
  });

  it("membro suspenso pode ser reativado ou excluído", () => {
    expect(allowedStatusChanges({ myRoles: ["diretor"], targetRoles: ["membro"], targetStatus: "suspenso", isSelf: false })).toEqual(["ativo", "excluido"]);
  });

  it("membro ativo pode ser suspenso ou excluído, nunca 'reativado'", () => {
    expect(allowedStatusChanges({ myRoles: ["secretario"], targetRoles: ["membro"], targetStatus: "ativo", isSelf: false })).toEqual(["suspenso", "excluido"]);
  });

  it("Tesoureiro e Membro não alteram estados", () => {
    expect(allowedStatusChanges({ myRoles: ["tesoureiro"], targetRoles: ["membro"], targetStatus: "ativo", isSelf: false })).toEqual([]);
    expect(allowedStatusChanges({ myRoles: ["membro"], targetRoles: ["membro"], targetStatus: "ativo", isSelf: false })).toEqual([]);
  });
});
