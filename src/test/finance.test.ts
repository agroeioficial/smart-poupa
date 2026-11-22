import { describe, expect, it } from "vitest";
import { canDecideOnDeposit, canManageFinance, parseAmount, receiptProblem } from "@/lib/finance";

// Fase 2 — pedido da AGROEI de 22/11/2026.
describe("Quem gere depósitos", () => {
  it("só Diretor e Tesoureiro validam e fazem estornos", () => {
    expect(canManageFinance(["diretor"])).toBe(true);
    expect(canManageFinance(["tesoureiro", "membro"])).toBe(true);
    expect(canManageFinance(["secretario"])).toBe(false);
    expect(canManageFinance(["membro"])).toBe(false);
  });
  it("ninguém decide sobre um depósito seu se houver outro Diretor/Tesoureiro", () => {
    expect(canDecideOnDeposit({ isMine: true, otherFinanceAdmins: 1 })).toBe(false);
    expect(canDecideOnDeposit({ isMine: true, otherFinanceAdmins: 0 })).toBe(true);
    expect(canDecideOnDeposit({ isMine: false, otherFinanceAdmins: 1 })).toBe(true);
  });
});

describe("Valor do depósito (MZN, 2 casas)", () => {
  it("aceita vírgula ou ponto", () => {
    expect(parseAmount("1500,50")).toBe(1500.5);
    expect(parseAmount("200")).toBe(200);
  });
  it("recusa zero, negativos e mais de 2 casas decimais", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("10,555")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("Comprovativo", () => {
  it("é obrigatório, PDF ou imagem, até 5 MB", () => {
    expect(receiptProblem(null)).not.toBeNull();
    expect(receiptProblem({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(receiptProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(receiptProblem({ type: "application/zip", size: 1000 })).not.toBeNull();
    expect(receiptProblem({ type: "image/png", size: 6 * 1024 * 1024 })).not.toBeNull();
  });
});
