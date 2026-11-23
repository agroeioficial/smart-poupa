import { describe, expect, it } from "vitest";
import {
  canOpenLoanDocuments,
  canVoteOnLoan,
  loanApproval,
  loanRequestProblem,
  parseRate,
  parseTerm,
  voteDeadlinePassed,
} from "@/lib/loans";
import type { GroupRole } from "@/lib/roles";

// Fase 3 — decisões da AGROEI de 23/11/2026.
const adm = (id: string, ...roles: GroupRole[]) => ({ memberId: id, roles });
const ok = (id: string) => ({ memberId: id, vote: "aprovado" as const });
const no = (id: string) => ({ memberId: id, vote: "rejeitado" as const });
const board3 = [adm("d", "diretor"), adm("t", "tesoureiro", "membro"), adm("s", "secretario")];

describe("Aprovação do empréstimo (mesma regra da suspensão)", () => {
  it("com três administradores, duas aprovações não chegam", () => {
    expect(loanApproval({ board: board3, borrowerMemberId: "m", votes: [ok("d"), ok("t")] }).state).toBe("pendente");
  });
  it("Diretor, Tesoureiro e Secretário aprovam → aprovado", () => {
    expect(loanApproval({ board: board3, borrowerMemberId: "m", votes: [ok("d"), ok("t"), ok("s")] }).state).toBe("aprovado");
  });
  it("com quatro ou mais, bastam os três principais", () => {
    const board = [...board3, adm("s2", "secretario")];
    expect(loanApproval({ board, borrowerMemberId: "m", votes: [ok("d"), ok("t"), ok("s")] }).state).toBe("aprovado");
    const semTesoureiro = loanApproval({ board, borrowerMemberId: "m", votes: [ok("d"), ok("s"), ok("s2")] });
    expect(semTesoureiro.state).toBe("pendente");
    expect(semTesoureiro.missingRoles).toEqual(["tesoureiro"]);
  });
  it("uma rejeição rejeita", () => {
    expect(loanApproval({ board: board3, borrowerMemberId: "m", votes: [ok("d"), no("s")] }).state).toBe("rejeitado");
  });
  it("quem pede não conta: sobram 2, os 2 aprovam", () => {
    const r = loanApproval({ board: board3, borrowerMemberId: "t", votes: [ok("d")] });
    expect(r.need).toBe(2);
    expect(r.state).toBe("pendente");
    expect(loanApproval({ board: board3, borrowerMemberId: "t", votes: [ok("d"), ok("s")] }).state).toBe("aprovado");
  });
  it("com um só administrador (que não é quem pede), basta ele", () => {
    expect(loanApproval({ board: [adm("d", "diretor")], borrowerMemberId: "m", votes: [ok("d")] }).state).toBe("aprovado");
  });
});

describe("Quem vota", () => {
  const base = { myMemberId: "d", borrowerMemberId: "m", status: "submetido" as const, alreadyVoted: false };
  it("só a direção vota", () => {
    expect(canVoteOnLoan({ ...base, myRoles: ["secretario"] })).toBe(true);
    expect(canVoteOnLoan({ ...base, myRoles: ["membro"] })).toBe(false);
  });
  it("ninguém vota no próprio pedido nem duas vezes", () => {
    expect(canVoteOnLoan({ ...base, myRoles: ["diretor"], borrowerMemberId: "d" })).toBe(false);
    expect(canVoteOnLoan({ ...base, myRoles: ["diretor"], alreadyVoted: true })).toBe(false);
  });
  it("pedidos decididos ou cancelados já não recebem votos", () => {
    expect(canVoteOnLoan({ ...base, myRoles: ["diretor"], status: "aprovado" })).toBe(false);
    expect(canVoteOnLoan({ ...base, myRoles: ["diretor"], status: "cancelado" })).toBe(false);
  });
  it("o Secretário vota mas não abre os documentos", () => {
    expect(canOpenLoanDocuments({ myRoles: ["secretario"], isMine: false })).toBe(false);
    expect(canOpenLoanDocuments({ myRoles: ["tesoureiro"], isMine: false })).toBe(true);
    expect(canOpenLoanDocuments({ myRoles: ["membro"], isMine: true })).toBe(true);
  });
});

describe("Pedido de empréstimo", () => {
  const full = { amount: 5000, term: 6, purpose: "Compra de sementes", declaration: true, guaranteeRequired: false, guaranteeDescription: "", guaranteeFile: false };
  it("a declaração de dívida é sempre obrigatória", () => {
    expect(loanRequestProblem(full)).toBeNull();
    expect(loanRequestProblem({ ...full, declaration: false })).not.toBeNull();
  });
  it("garantia só é exigida se o grupo a tornar obrigatória (descrição e anexo)", () => {
    expect(loanRequestProblem({ ...full, guaranteeRequired: true })).not.toBeNull();
    expect(loanRequestProblem({ ...full, guaranteeRequired: true, guaranteeDescription: "Motorizada" })).not.toBeNull();
    expect(loanRequestProblem({ ...full, guaranteeRequired: true, guaranteeDescription: "Motorizada", guaranteeFile: true })).toBeNull();
  });
  it("prazo de 1 a 120 meses", () => {
    expect(parseTerm("6")).toBe(6);
    expect(parseTerm("0")).toBeNull();
    expect(parseTerm("121")).toBeNull();
    expect(parseTerm("1,5")).toBeNull();
  });
});

describe("Regras definidas pelo grupo", () => {
  it("taxa de juros de 0 a 100%, até 2 casas", () => {
    expect(parseRate("10")).toBe(10);
    expect(parseRate("2,5")).toBe(2.5);
    expect(parseRate("101")).toBeNull();
    expect(parseRate("1,555")).toBeNull();
  });
  it("prazo de votação: aviso só depois dos dias definidos; sem prazo nunca avisa", () => {
    const now = new Date("2026-11-30T12:00:00Z");
    expect(voteDeadlinePassed("2026-11-20T12:00:00Z", 7, now)).toBe(true);
    expect(voteDeadlinePassed("2026-11-25T12:00:00Z", 7, now)).toBe(false);
    expect(voteDeadlinePassed("2026-01-01T12:00:00Z", null, now)).toBe(false);
  });
});
