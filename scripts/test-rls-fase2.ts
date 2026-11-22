// Teste de segurança da Fase 2 (depósitos, comprovativos, saldos e estornos) contra a base de dados real.
// Cria contas e grupos fictícios (@exemplo.test) e apaga-os no fim. Requer SUPABASE_URL,
// SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY. Executar: bun scripts/test-rls-fase2.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
const URL = process.env.SUPABASE_URL!, ANON = process.env.SUPABASE_PUBLISHABLE_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SR, opts);
const tag = "f2t" + Date.now().toString(36);
const mail = (n: string) => `${tag}-${n}@exemplo.test`;
const PW = "Teste-" + tag + "!9";
let pass = 0, fail = 0; const results: string[] = [];
function check(name: string, ok: boolean, extra = "") { ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"} | ${name}${extra ? " | " + extra : ""}`); }
const users: Record<string, string> = {};
const cl: Record<string, SupabaseClient> = {};
const groupIds: string[] = [];
const uploaded: string[] = [];
const PDF = new TextEncoder().encode("%PDF-1.4\n% comprovativo de teste\n%%EOF");

async function mkUser(n: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: mail(n), password: PW, email_confirm: true, user_metadata: { full_name: "Teste " + n } });
  if (error) throw error; users[n] = data.user.id;
}
async function login(n: string) {
  const c = createClient(URL, ANON, opts);
  const { error } = await c.auth.signInWithPassword({ email: mail(n), password: PW });
  if (error) throw new Error(n + ": " + error.message); cl[n] = c; return c;
}
async function upload(who: string, group: string, owner = who) {
  const path = `${group}/${users[owner]}/${crypto.randomUUID()}.pdf`;
  const { error } = await cl[who].storage.from("comprovativos").upload(path, PDF, { contentType: "application/pdf", upsert: false });
  if (!error) uploaded.push(path);
  return { path, error };
}
const today = new Date().toISOString().slice(0, 10);

try {
  for (const n of ["owner", "dirA", "tesA", "secA", "memA1", "memA2", "dirB"]) await mkUser(n);
  await admin.from("platform_roles").insert({ user_id: users.owner, role: "agroei_owner" });
  const owner = await login("owner");
  const mk = async (name: string, dir: string) => {
    const { data, error } = await owner.rpc("create_group", { _name: name, _location: "Maputo", _official_phone: "", _official_email: "", _director_name: "Diretor " + dir, _director_email: mail(dir), _director_phone: "840000001" });
    if (error) throw error; groupIds.push(data as string); return data as string;
  };
  const gA = await mk("Grupo Teste F2 A", "dirA"), gB = await mk("Grupo Teste F2 B", "dirB");
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
  const mid = async (n: string) => (await admin.from("group_members").select("id").eq("user_id", users[n]).eq("group_id", gA).single()).data!.id as string;
  const memA1Id = await mid("memA1"), memA2Id = await mid("memA2");
  const { data: profId } = await cl.secA.rpc("create_collective_profile", { _group_id: gA, _name: "Família Teste", _relation_type: "familia" });
  for (const id of [memA1Id, memA2Id]) await cl.secA.rpc("set_member_collective_profile", { _member_id: id, _profile_id: profId as string });

  // Contas / carteiras do grupo
  const { data: accId, error: eAcc } = await cl.tesA.rpc("create_payment_account", { _group_id: gA, _channel: "mpesa", _institution: "", _account_number: "841234567", _holder_name: "Grupo Teste" });
  check("Tesoureiro regista a carteira M-Pesa do grupo", !eAcc && !!accId, eAcc?.message);
  const { error: eAccBank } = await cl.dirA.rpc("create_payment_account", { _group_id: gA, _channel: "banco", _institution: "", _account_number: "000123", _holder_name: "Grupo" });
  check("Conta bancária exige o nome do banco", !!eAccBank, eAccBank?.message);
  const { error: eAccSec } = await cl.secA.rpc("create_payment_account", { _group_id: gA, _channel: "emola", _institution: "", _account_number: "861234567", _holder_name: "X" });
  const { error: eAccMem } = await cl.memA1.rpc("create_payment_account", { _group_id: gA, _channel: "emola", _institution: "", _account_number: "861234567", _holder_name: "X" });
  check("Secretário e membros não gerem contas do grupo", !!eAccSec && !!eAccMem);
  const { data: accMem } = await cl.memA1.from("group_payment_accounts").select("id");
  const { data: accB } = await cl.dirB.from("group_payment_accounts").select("id").eq("group_id", gA);
  check("Membros veem as contas do seu grupo; outro grupo não", accMem?.length === 1 && (accB?.length ?? 0) === 0);

  // Comprovativos
  const r1 = await upload("memA1", gA);
  check("Membro anexa comprovativo na sua pasta", !r1.error, r1.error?.message);
  const rOther = await upload("memA1", gA, "memA2");
  const rCross = await upload("dirB", gA);
  check("Ninguém anexa na pasta de outra pessoa ou de outro grupo", !!rOther.error && !!rCross.error);

  // Submissão
  const base = { _group_id: gA, _for_collective: false, _amount: 500, _deposit_date: today, _channel: "mpesa", _payment_account_id: accId, _transaction_ref: "MP-0001", _receipt_path: r1.path, _notes: "" };
  const bad = async (over: Record<string, unknown>) => (await cl.memA1.rpc("submit_deposit", { ...base, ...over } as any)).error;
  check("Recusa valor zero ou com mais de 2 casas decimais", !!(await bad({ _amount: 0 })) && !!(await bad({ _amount: 10.555 })));
  check("Recusa data no futuro", !!(await bad({ _deposit_date: "2999-01-01" })));
  check("Recusa comprovativo inexistente", !!(await bad({ _receipt_path: `${gA}/${users.memA1}/nao-existe.pdf` })));
  check("Recusa conta de outro canal", !!(await bad({ _channel: "emola" })));
  check("Recusa referência vazia", !!(await bad({ _transaction_ref: " " })));
  const { data: dep1, error: eDep1 } = await cl.memA1.rpc("submit_deposit", base as any);
  check("Membro submete depósito individual", !eDep1 && !!dep1, eDep1?.message);
  const r1b = await upload("memA1", gA);
  check("Referência repetida no mesmo canal é recusada", !!(await bad({ _receipt_path: r1b.path })));
  const { data: s0 } = await cl.memA1.rpc("my_savings", { _group_id: gA });
  const ind0 = (s0 ?? []).find((s: any) => s.scope === "individual");
  check("Pendente não altera o saldo confirmado", Number(ind0?.confirmed) === 0 && Number(ind0?.pending) === 500, JSON.stringify(ind0));

  // Visibilidade
  const seen = async (n: string) => ((await cl[n].from("deposits").select("id").eq("id", dep1 as string)).data?.length ?? 0) === 1;
  check("Tesoureiro e Diretor veem o depósito", (await seen("tesA")) && (await seen("dirA")));
  check("Outro membro, Secretário e outro grupo não veem o depósito individual", !(await seen("memA2")) && !(await seen("secA")) && !(await seen("dirB")));
  const { data: dOwner } = await owner.from("deposits").select("id");
  check("AGROEI não vê depósitos", (dOwner?.length ?? 0) === 0);
  const dl = async (n: string) => !(await cl[n].storage.from("comprovativos").download(r1.path)).error;
  check("Tesoureiro abre o comprovativo", await dl("tesA"));
  check("Outro membro, Secretário e outro grupo não abrem o comprovativo", !(await dl("memA2")) && !(await dl("secA")) && !(await dl("dirB")));

  // Validação
  const rev = async (n: string, id: string, approve: boolean, reason = "") => cl[n].rpc("review_deposit", { _deposit_id: id, _approve: approve, _reason: reason });
  check("Membro não valida o próprio depósito", !!(await rev("memA1", dep1 as string, true)).error);
  check("Secretário e outro grupo não validam", !!(await rev("secA", dep1 as string, true)).error && !!(await rev("dirB", dep1 as string, true)).error);
  const { data: st1, error: eSt1 } = await rev("tesA", dep1 as string, true);
  check("Tesoureiro aprova o depósito", !eSt1 && st1 === "aprovado", eSt1?.message);
  const { data: s1 } = await cl.memA1.rpc("my_savings", { _group_id: gA });
  const ind1 = (s1 ?? []).find((s: any) => s.scope === "individual");
  check("Saldo só é creditado após aprovação", Number(ind1?.confirmed) === 500 && Number(ind1?.pending) === 0, JSON.stringify(ind1));
  check("Depósito já decidido não volta a ser decidido", !!(await rev("dirA", dep1 as string, false, "x")).error);
  const { data: aud } = await cl.dirA.from("audit_log").select("action, details").eq("entity_id", dep1 as string);
  const aprov = (aud ?? []).find((a: any) => a.action === "deposito_aprovado");
  check("Auditoria guarda valor, estado anterior e novo", !!aprov && (aprov as any).details.estado_anterior === "pendente" && Number((aprov as any).details.valor) === 500);

  // Escrita direta e imutabilidade
  const { error: eUpdD, data: updD } = await cl.tesA.from("deposits").update({ amount: 9999 }).eq("id", dep1 as string).select();
  const { error: eInsL } = await cl.tesA.from("savings_ledger").insert({ group_id: gA, member_id: memA1Id, kind: "deposito", amount: 1000, deposit_id: dep1 });
  check("Ninguém altera depósitos nem saldos diretamente", (!!eUpdD || (updD?.length ?? 0) === 0) && !!eInsL);
  const { error: eSrvDel } = await admin.from("savings_ledger").delete().eq("deposit_id", dep1 as string);
  const { error: eSrvUpd } = await admin.from("deposits").update({ amount: 1 }).eq("id", dep1 as string);
  check("Nem com acesso total se apagam movimentos ou se mudam depósitos decididos", !!eSrvDel && !!eSrvUpd);
  await cl.memA1.storage.from("comprovativos").remove([r1.path]);
  const { data: still } = await admin.storage.from("comprovativos").download(r1.path);
  check("Comprovativo não pode ser apagado pelo membro", !!still);

  // Perfil coletivo
  const r2 = await upload("memA2", gA);
  const { data: dep2, error: eDep2 } = await cl.memA2.rpc("submit_deposit", { ...base, _for_collective: true, _amount: 300, _transaction_ref: "MP-0002", _receipt_path: r2.path } as any);
  check("Integrante submete depósito para a cota do perfil coletivo", !eDep2, eDep2?.message);
  const { data: dep2row } = await cl.memA1.from("deposits").select("collective_profile_id, member_id, submitted_by_member").eq("id", dep2 as string).single();
  check("Outro integrante vê o depósito do perfil e quem o submeteu", dep2row?.collective_profile_id === profId && dep2row?.member_id === null && dep2row?.submitted_by_member === memA2Id);
  await rev("dirA", dep2 as string, true);
  const { data: s2 } = await cl.memA1.rpc("my_savings", { _group_id: gA });
  const col = (s2 ?? []).find((s: any) => s.scope === "coletivo");
  const ind2 = (s2 ?? []).find((s: any) => s.scope === "individual");
  check("Saldo coletivo pertence à cota do perfil, não ao individual", Number(col?.confirmed) === 300 && Number(ind2?.confirmed) === 500, JSON.stringify(s2));
  const r2b = await upload("tesA", gA);
  const { error: eNoCol } = await cl.tesA.rpc("submit_deposit", { ...base, _for_collective: true, _transaction_ref: "MP-0099", _receipt_path: r2b.path } as any);
  check("Quem não pertence a um perfil não deposita como coletivo", !!eNoCol);

  // Rejeição
  const r3 = await upload("memA1", gA);
  const { data: dep3 } = await cl.memA1.rpc("submit_deposit", { ...base, _amount: 200, _transaction_ref: "MP-0003", _receipt_path: r3.path } as any);
  check("Rejeitar exige motivo", !!(await rev("tesA", dep3 as string, false, "")).error);
  const { data: st3 } = await rev("tesA", dep3 as string, false, "Referência não encontrada no extrato");
  const { data: s3 } = await cl.memA1.rpc("my_savings", { _group_id: gA });
  check("Depósito rejeitado não entra no saldo", st3 === "rejeitado" && Number((s3 ?? []).find((s: any) => s.scope === "individual")?.confirmed) === 500);
  const r3b = await upload("memA1", gA);
  const { error: eReuse } = await cl.memA1.rpc("submit_deposit", { ...base, _amount: 200, _transaction_ref: "MP-0003", _receipt_path: r3b.path } as any);
  check("Depois de rejeitado, a referência pode ser submetida de novo", !eReuse, eReuse?.message);

  // Estornos
  const revs = async (n: string, id: string, reason: string) => cl[n].rpc("reverse_deposit", { _deposit_id: id, _reason: reason });
  check("Membro e Secretário não fazem estornos", !!(await revs("memA1", dep1 as string, "x")).error && !!(await revs("secA", dep1 as string, "x")).error);
  check("Estorno exige motivo", !!(await revs("tesA", dep1 as string, " ")).error);
  const { error: eRev } = await revs("tesA", dep1 as string, "Valor duplicado no extrato");
  const { data: led } = await cl.memA1.from("savings_ledger").select("kind, amount").eq("deposit_id", dep1 as string);
  const { data: s4 } = await cl.memA1.rpc("my_savings", { _group_id: gA });
  check("Estorno cria lançamento inverso e mantém o original", !eRev && led?.length === 2 && led.some((l) => l.kind === "deposito" && Number(l.amount) === 500) && led.some((l) => l.kind === "estorno" && Number(l.amount) === -500), eRev?.message);
  check("Saldo após estorno", Number((s4 ?? []).find((s: any) => s.scope === "individual")?.confirmed) === 0);
  check("Não se estorna duas vezes nem um depósito rejeitado", !!(await revs("dirA", dep1 as string, "de novo")).error && !!(await revs("dirA", dep3 as string, "x")).error);

  // Ninguém decide sobre o próprio depósito (há outro Diretor/Tesoureiro)
  const r5 = await upload("tesA", gA);
  const { data: dep5 } = await cl.tesA.rpc("submit_deposit", { ...base, _amount: 100, _transaction_ref: "MP-0005", _receipt_path: r5.path } as any);
  check("Tesoureiro não aprova o próprio depósito", !!(await rev("tesA", dep5 as string, true)).error);
  const { data: st5 } = await rev("dirA", dep5 as string, true);
  check("Diretor aprova o depósito do Tesoureiro", st5 === "aprovado");
  check("Tesoureiro não estorna o próprio depósito", !!(await revs("tesA", dep5 as string, "x")).error);

  // Saldos do grupo
  const { data: gs } = await cl.tesA.rpc("group_savings", { _group_id: gA });
  const { data: gsMem } = await cl.memA1.rpc("group_savings", { _group_id: gA });
  const { data: gsSec } = await cl.secA.rpc("group_savings", { _group_id: gA });
  const { data: gsB } = await cl.dirB.rpc("group_savings", { _group_id: gA });
  check("Só Diretor/Tesoureiro veem os saldos de todos", (gs?.length ?? 0) >= 5 && (gsMem?.length ?? 0) === 0 && (gsSec?.length ?? 0) === 0 && (gsB?.length ?? 0) === 0);
  const { data: ledSec } = await cl.secA.from("savings_ledger").select("id");
  const { data: ledM2 } = await cl.memA2.from("savings_ledger").select("id, member_id");
  check("Secretário não vê movimentos; membro só vê os seus e os do perfil", (ledSec?.length ?? 0) === 0 && (ledM2 ?? []).every((l) => l.member_id === null || l.member_id === memA2Id));
} catch (e) { check("Execução sem erros", false, String((e as Error).message ?? e)); }
finally {
  if (uploaded.length) await admin.storage.from("comprovativos").remove(uploaded);
  for (const g of groupIds) await admin.rpc("purge_test_group_finance", { _group_id: g });
  if (groupIds.length) {
    for (const t of ["audit_log", "admin_role_history", "group_events", "member_beneficiary_history", "member_beneficiaries", "member_status_request_votes", "member_status_requests", "group_member_roles", "member_private_data", "group_members", "collective_profiles"]) await admin.from(t).delete().in("group_id", groupIds);
    await admin.from("groups").delete().in("id", groupIds);
  }
  for (const id of Object.values(users)) await admin.auth.admin.deleteUser(id);
  const { data: left } = await admin.from("groups").select("id").in("id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"]);
  results.push(`Limpeza: grupos de teste restantes=${left?.length ?? 0}`);
}
console.log(results.join("\n")); console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
