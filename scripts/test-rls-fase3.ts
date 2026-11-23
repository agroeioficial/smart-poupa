// Teste de segurança da Fase 3 (pedidos de empréstimo e votação da direção) contra a base de dados real.
// Cria contas e grupos fictícios (@exemplo.test) e apaga-os no fim. Requer SUPABASE_URL,
// SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY. Executar: bun scripts/test-rls-fase3.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
const URL = process.env.SUPABASE_URL!, ANON = process.env.SUPABASE_PUBLISHABLE_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SR, opts);
const tag = "f3t" + Date.now().toString(36);
const mail = (n: string) => `${tag}-${n}@exemplo.test`;
const PW = "Teste-" + tag + "!9";
let pass = 0, fail = 0; const results: string[] = [];
function check(name: string, ok: boolean, extra = "") { ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"} | ${name}${extra ? " | " + extra : ""}`); }
const users: Record<string, string> = {};
const cl: Record<string, SupabaseClient> = {};
const groupIds: string[] = [];
const uploaded: string[] = [];
const PDF = new TextEncoder().encode("%PDF-1.4\n% declaracao de teste\n%%EOF");

async function mkUser(n: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: mail(n), password: PW, email_confirm: true, user_metadata: { full_name: "Teste " + n } });
  if (error) throw error; users[n] = data.user.id;
}
async function login(n: string) {
  const c = createClient(URL, ANON, opts);
  const { error } = await c.auth.signInWithPassword({ email: mail(n), password: PW });
  if (error) throw new Error(n + ": " + error.message); cl[n] = c; return c;
}
async function upload(who: string, group: string) {
  const path = `${group}/${users[who]}/emprestimos/${crypto.randomUUID()}.pdf`;
  const { error } = await cl[who].storage.from("comprovativos").upload(path, PDF, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error("upload " + who + ": " + error.message);
  uploaded.push(path); return path;
}

try {
  for (const n of ["owner", "dirA", "tesA", "secA", "memA1", "memA2", "dirB"]) await mkUser(n);
  await admin.from("platform_roles").insert({ user_id: users.owner, role: "agroei_owner" });
  const owner = await login("owner");
  const mk = async (name: string, dir: string) => {
    const { data, error } = await owner.rpc("create_group", { _name: name, _location: "Maputo", _official_phone: "", _official_email: "", _director_name: "Diretor " + dir, _director_email: mail(dir), _director_phone: "840000001" });
    if (error) throw error; groupIds.push(data as string); return data as string;
  };
  const gA = await mk("Grupo Teste F3 A", "dirA"), gB = await mk("Grupo Teste F3 B", "dirB");
  const accept = async (n: string) => {
    const c = await login(n);
    const { data } = await c.from("group_members").select("id").eq("user_id", users[n]);
    const { error } = await c.rpc("accept_invitation", { _member_id: data![0].id });
    if (error) throw error;
  };
  await accept("dirA"); await accept("dirB");
  for (const [n, r] of [["tesA", ["tesoureiro", "membro"]], ["secA", ["secretario"]], ["memA1", ["membro"]], ["memA2", ["membro"]]] as const) {
    const { error } = await cl.dirA.rpc("add_group_member", { _group_id: gA, _full_name: "Pessoa " + n, _email: mail(n), _phone: "840001111", _profession: "Agricultor", _roles: [...r] as any, _id_document_type: "BI", _id_document_number: "T-" + n, _birth_date: "1990-01-01", _address: "Rua" });
    if (error) throw error;
  }
  for (const n of ["tesA", "secA", "memA1", "memA2"]) await accept(n);
  const { data: boardA } = await cl.memA1.rpc("group_board", { _group_id: gA });
  if ((boardA?.length ?? 0) !== 3) throw new Error("Direção de teste incompleta: " + JSON.stringify(boardA));

  const submit = (n: string, over: Record<string, unknown>) =>
    cl[n].rpc("submit_loan_request", { _group_id: gA, _amount: 5000, _term_months: 6, _purpose: "Compra de sementes", _declaration_path: "", _guarantee_description: "", _guarantee_path: null, ...over } as any);

  // ---------- Pedido ----------
  const d1 = await upload("memA1", gA);
  check("Recusa pedido sem declaração", !!(await submit("memA1", {})).error);
  check("Recusa valor zero e prazo inválido", !!(await submit("memA1", { _declaration_path: d1, _amount: 0 })).error && !!(await submit("memA1", { _declaration_path: d1, _term_months: 0 })).error);
  check("Recusa finalidade vazia", !!(await submit("memA1", { _declaration_path: d1, _purpose: "  " })).error);
  const dOther = await upload("memA2", gA);
  check("Recusa documento de outra pessoa", !!(await submit("memA1", { _declaration_path: dOther })).error);
  const { data: loan1, error: eL1 } = await submit("memA1", { _declaration_path: d1 });
  check("Membro ativo envia pedido de empréstimo", !eL1 && !!loan1, eL1?.message);
  const { data: l1row } = await cl.memA1.from("loans").select("status, interest_rate").eq("id", loan1 as string).single();
  check("Pedido começa como Submetido", l1row?.status === "submetido");
  check("Mesmo ficheiro não serve para dois pedidos", !!(await submit("memA1", { _declaration_path: d1 })).error);
  const { error: eOut } = await cl.dirB.rpc("submit_loan_request", { _group_id: gA, _amount: 100, _term_months: 1, _purpose: "Fora do grupo", _declaration_path: d1 } as any);
  check("Pessoa de outro grupo não pede empréstimo neste grupo", !!eOut);

  // ---------- Regras do grupo ----------
  const setRules = (n: string, days: number | null, req: boolean, method: string | null, rate: number | null) =>
    cl[n].rpc("set_group_loan_settings", { _group_id: gA, _vote_deadline_days: days, _guarantee_required: req, _interest_method: method, _interest_rate: rate } as any);
  check("Só o Diretor altera as regras de empréstimo", !!(await setRules("secA", 7, true, "fixa_unica", 10)).error && !!(await setRules("tesA", 7, true, "fixa_unica", 10)).error && !!(await setRules("memA1", 7, true, "fixa_unica", 10)).error);
  check("Recusa método sem taxa e taxa acima de 100%", !!(await setRules("dirA", 7, true, "fixa_unica", null)).error && !!(await setRules("dirA", 7, true, "fixa_unica", 150)).error);
  const { error: eRules } = await setRules("dirA", 7, true, "fixa_unica", 10);
  check("Diretor define prazo de 7 dias, garantia obrigatória e juros de 10%", !eRules, eRules?.message);
  const { data: rulesSeen } = await cl.memA2.from("group_loan_settings").select("interest_rate").eq("group_id", gA);
  const { data: rulesOwner } = await owner.from("group_loan_settings").select("group_id");
  const { data: rulesB } = await cl.dirB.from("group_loan_settings").select("group_id").eq("group_id", gA);
  check("Membros veem as regras; AGROEI e outro grupo não", Number(rulesSeen?.[0]?.interest_rate) === 10 && (rulesOwner?.length ?? 0) === 0 && (rulesB?.length ?? 0) === 0);
  const d2 = await upload("memA2", gA);
  check("Com garantia obrigatória, pedido sem garantia é recusado", !!(await submit("memA2", { _declaration_path: d2 })).error);
  const g2 = await upload("memA2", gA);
  check("Garantia obrigatória exige também o anexo", !!(await submit("memA2", { _declaration_path: d2, _guarantee_description: "Motorizada" })).error);
  const { data: loan2, error: eL2 } = await submit("memA2", { _declaration_path: d2, _guarantee_description: "Motorizada", _guarantee_path: g2 });
  check("Pedido com garantia é aceite", !eL2, eL2?.message);
  const { data: l2row } = await cl.memA2.from("loans").select("interest_method, interest_rate").eq("id", loan2 as string).single();
  check("Pedido guarda os juros em vigor (10%, fixa única)", l2row?.interest_method === "fixa_unica" && Number(l2row?.interest_rate) === 10);
  const { data: l1after } = await cl.memA1.from("loans").select("interest_rate").eq("id", loan1 as string).single();
  check("Pedido anterior não muda com as novas regras", l1after?.interest_rate === null);

  // ---------- Visibilidade ----------
  const sees = async (n: string, id: string) => ((await cl[n].from("loans").select("id").eq("id", id)).data?.length ?? 0) === 1;
  check("Quem pediu e toda a direção veem o pedido", (await sees("memA1", loan1 as string)) && (await sees("dirA", loan1 as string)) && (await sees("tesA", loan1 as string)) && (await sees("secA", loan1 as string)));
  check("Outro membro e outro grupo não veem o pedido", !(await sees("memA2", loan1 as string)) && !(await sees("dirB", loan1 as string)));
  const { data: lOwner } = await owner.from("loans").select("id");
  check("AGROEI não vê empréstimos", (lOwner?.length ?? 0) === 0);
  const dl = async (n: string, p: string) => !(await cl[n].storage.from("comprovativos").download(p)).error;
  check("Diretor e Tesoureiro abrem a declaração", (await dl("dirA", d1)) && (await dl("tesA", d1)));
  check("Secretário, outro membro e outro grupo não abrem a declaração", !(await dl("secA", d1)) && !(await dl("memA2", d1)) && !(await dl("dirB", d1)));

  // ---------- Votação: 3 administradores, regra da suspensão ----------
  const vote = (n: string, id: string, approve: boolean, reason = "") => cl[n].rpc("vote_loan", { _loan_id: id, _approve: approve, _reason: reason });
  check("Membro e outro grupo não votam", !!(await vote("memA1", loan1 as string, true)).error && !!(await vote("memA2", loan1 as string, true)).error && !!(await vote("dirB", loan1 as string, true)).error);
  const { data: v1 } = await vote("dirA", loan1 as string, true);
  check("Primeiro voto passa o pedido a Em análise", v1 === "em_analise");
  check("Ninguém vota duas vezes", !!(await vote("dirA", loan1 as string, true)).error);
  const { data: v2 } = await vote("tesA", loan1 as string, true);
  const { data: l1two } = await cl.memA1.from("loans").select("status").eq("id", loan1 as string).single();
  check("Com apenas duas aprovações o empréstimo não fica aprovado", v2 === "em_analise" && l1two?.status === "em_analise");
  const { data: v3, error: eV3 } = await vote("secA", loan1 as string, true);
  check("Com Diretor, Tesoureiro e Secretário o empréstimo é aprovado", v3 === "aprovado", eV3?.message);
  const { data: votesMem } = await cl.memA1.from("loan_votes").select("id").eq("loan_id", loan1 as string);
  const { data: votesSec } = await cl.secA.from("loan_votes").select("vote").eq("loan_id", loan1 as string);
  check("Cada voto fica registado; só a direção os vê", (votesSec?.length ?? 0) === 3 && (votesMem?.length ?? 0) === 0);
  check("Pedido decidido não recebe mais votos nem é cancelado", !!(await vote("dirA", loan1 as string, false, "tarde")).error && !!(await cl.memA1.rpc("cancel_loan_request", { _loan_id: loan1 as string, _reason: "" })).error);
  const { data: aud } = await cl.dirA.from("audit_log").select("action, details").eq("entity_id", loan1 as string);
  const audOk = (aud ?? []).find((a: any) => a.action === "emprestimo_aprovado");
  check("Auditoria guarda pedido, votos e aprovação", (aud ?? []).some((a: any) => a.action === "emprestimo_pedido") && (aud ?? []).filter((a: any) => a.action === "emprestimo_voto_aprovado").length === 3 && (audOk as any)?.details?.estado_anterior === "em_analise");

  // ---------- Rejeição ----------
  check("Rejeição exige motivo", !!(await vote("secA", loan2 as string, false, " ")).error);
  const { data: vr } = await vote("dirA", loan2 as string, true);
  const { data: vr2 } = await vote("secA", loan2 as string, false, "Garantia insuficiente");
  check("Uma rejeição rejeita o pedido", vr === "em_analise" && vr2 === "rejeitado");
  const { data: l2rej } = await cl.memA2.from("loans").select("status, rejection_reason").eq("id", loan2 as string).single();
  check("O membro vê o motivo da rejeição", l2rej?.status === "rejeitado" && l2rej?.rejection_reason === "Garantia insuficiente");
  check("Pedido rejeitado não recebe mais votos", !!(await vote("tesA", loan2 as string, true)).error);
  const { data: sav } = await cl.memA2.rpc("my_savings", { _group_id: gA });
  check("Rejeição não altera o saldo", Number((sav ?? []).find((s: any) => s.scope === "individual")?.confirmed) === 0);

  // ---------- Administrador que pede ----------
  const d3 = await upload("tesA", gA), g3 = await upload("tesA", gA);
  const { data: loan3, error: eL3 } = await submit("tesA", { _declaration_path: d3, _guarantee_description: "Terreno", _guarantee_path: g3 });
  check("Administrador também pode pedir", !eL3, eL3?.message);
  check("Ninguém vota no próprio pedido", !!(await vote("tesA", loan3 as string, true)).error);
  const { data: v31 } = await vote("dirA", loan3 as string, true);
  const { data: v32 } = await vote("secA", loan3 as string, true);
  check("Sem quem pede restam 2 administradores: os 2 aprovam", v31 === "em_analise" && v32 === "aprovado");

  // ---------- Cancelamento ----------
  const d4 = await upload("memA1", gA), g4 = await upload("memA1", gA);
  const { data: loan4 } = await submit("memA1", { _declaration_path: d4, _guarantee_description: "Gado", _guarantee_path: g4 });
  check("Só quem pediu cancela", !!(await cl.dirA.rpc("cancel_loan_request", { _loan_id: loan4 as string, _reason: "" })).error && !!(await cl.memA2.rpc("cancel_loan_request", { _loan_id: loan4 as string, _reason: "" })).error);
  const { error: eCan } = await cl.memA1.rpc("cancel_loan_request", { _loan_id: loan4 as string, _reason: "Já não preciso" });
  const { data: l4 } = await cl.memA1.from("loans").select("status").eq("id", loan4 as string).single();
  check("Membro cancela o pedido antes da decisão", !eCan && l4?.status === "cancelado", eCan?.message);
  check("Pedido cancelado não recebe votos", !!(await vote("dirA", loan4 as string, true)).error);

  // ---------- Escrita direta e imutabilidade ----------
  const { error: eUpd, data: upd } = await cl.dirA.from("loans").update({ amount: 1 }).eq("id", loan1 as string).select();
  const { error: eIns } = await cl.dirA.from("loan_votes").insert({ loan_id: loan4, group_id: gA, voter_member_id: (boardA as any)[0].member_id, voter_user_id: users.dirA, vote: "aprovado" });
  check("Ninguém escreve pedidos ou votos diretamente", (!!eUpd || (upd?.length ?? 0) === 0) && !!eIns);
  const { error: eSrvUpd } = await admin.from("loans").update({ amount: 1 }).eq("id", loan1 as string);
  const { error: eSrvDel } = await admin.from("loans").delete().eq("id", loan2 as string);
  const { error: eSrvVote } = await admin.from("loan_votes").delete().eq("loan_id", loan1 as string);
  check("Nem com acesso total se alteram ou apagam pedidos e votos", !!eSrvUpd && !!eSrvDel && !!eSrvVote);

  // ---------- Grupo com um só administrador ----------
  await login("dirB");
  const dB = `${gB}/${users.dirB}/emprestimos/${crypto.randomUUID()}.pdf`;
  await cl.dirB.storage.from("comprovativos").upload(dB, PDF, { contentType: "application/pdf" }); uploaded.push(dB);
  const { error: eSolo } = await cl.dirB.rpc("submit_loan_request", { _group_id: gB, _amount: 100, _term_months: 1, _purpose: "Teste solo", _declaration_path: dB } as any);
  check("Único administrador não pede sem outro administrador para decidir", !!eSolo);
} catch (e) { check("Execução sem erros", false, String((e as Error).message ?? e)); }
finally {
  if (uploaded.length) await admin.storage.from("comprovativos").remove(uploaded);
  for (const g of groupIds) await admin.rpc("purge_test_group_finance", { _group_id: g });
  if (groupIds.length) {
    for (const t of ["group_loan_settings", "audit_log", "admin_role_history", "group_events", "member_beneficiary_history", "member_beneficiaries", "member_status_request_votes", "member_status_requests", "group_member_roles", "member_private_data", "group_members", "collective_profiles"]) await admin.from(t).delete().in("group_id", groupIds);
    await admin.from("groups").delete().in("id", groupIds);
  }
  for (const id of Object.values(users)) await admin.auth.admin.deleteUser(id);
  const { data: left } = await admin.from("groups").select("id").in("id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"]);
  results.push(`Limpeza: grupos de teste restantes=${left?.length ?? 0}`);
}
console.log(results.join("\n")); console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
