// Teste de isolamento e permissões da Fase 1 contra a base de dados real.
// Cria contas e grupos fictícios (@exemplo.test) e apaga-os no fim. Requer SUPABASE_URL,
// SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY. Executar: bun scripts/test-rls-fase1.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
const URL = process.env.SUPABASE_URL!, ANON = process.env.SUPABASE_PUBLISHABLE_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SR, opts);
const tag = "f1t" + Date.now().toString(36);
const mail = (n: string) => `${tag}-${n}@exemplo.test`;
const PW = "Teste-" + tag + "!9";
let pass = 0, fail = 0; const results: string[] = [];
function check(name: string, ok: boolean, extra = "") { ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"} | ${name}${extra ? " | " + extra : ""}`); }
const users: Record<string, string> = {};
async function mkUser(n: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: mail(n), password: PW, email_confirm: true, user_metadata: { full_name: "Teste " + n } });
  if (error) throw error; users[n] = data.user.id; return data.user.id;
}
async function login(n: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, opts);
  const { error } = await c.auth.signInWithPassword({ email: mail(n), password: PW });
  if (error) throw new Error(n + ": " + error.message); return c;
}
const groupIds: string[] = [];
try {
  for (const n of ["owner", "dirA", "dirB", "memA1", "memA2", "tesA", "secA", "outsider"]) await mkUser(n);
  const { data: prof } = await admin.from("profiles").select("id,full_name").in("id", Object.values(users));
  check("Trigger cria perfil ao registar conta", prof?.length === 8);
  await admin.from("platform_roles").insert({ user_id: users.owner, role: "agroei_owner" });

  const owner = await login("owner"), dirA = await login("dirA"), dirB = await login("dirB"), outsider = await login("outsider");
  const { data: gA, error: eA } = await owner.rpc("create_group", { _name: "Grupo Teste A", _location: "Maputo", _official_phone: "", _official_email: "", _director_name: "Diretor A", _director_email: mail("dirA"), _director_phone: "840000001" });
  const { data: gB } = await owner.rpc("create_group", { _name: "Grupo Teste B", _location: "Beira", _official_phone: "", _official_email: "", _director_name: "Diretor B", _director_email: mail("dirB"), _director_phone: "840000002" });
  groupIds.push(gA as string, gB as string);
  check("AGROEI cria grupos", !eA && !!gA && !!gB, eA?.message);
  const { error: eNo } = await dirA.rpc("create_group", { _name: "X", _location: "", _official_phone: "", _official_email: "", _director_name: "Y", _director_email: "y@exemplo.test", _director_phone: "" });
  check("Não-AGROEI não consegue criar grupo", !!eNo, eNo?.message);

  const { data: invA } = await dirA.from("group_members").select("id,status,group_id").eq("user_id", users.dirA);
  check("Diretor A vê o convite pendente", invA?.length === 1 && invA[0].status === "convidado");
  const { data: gVisPre } = await dirA.from("groups").select("id");
  check("Diretor A (convidado) vê só o Grupo A", gVisPre?.length === 1 && gVisPre[0].id === gA);
  await dirA.rpc("accept_invitation", { _member_id: invA![0].id });
  const { data: invB } = await dirB.from("group_members").select("id").eq("user_id", users.dirB);
  await dirB.rpc("accept_invitation", { _member_id: invB![0].id });

  const add = (c: SupabaseClient, n: string, roles: string[], g = gA) => c.rpc("add_group_member", { _group_id: g, _full_name: "Pessoa " + n, _email: mail(n), _phone: "84" + Math.floor(Math.random() * 1e7), _profession: "Agricultor", _roles: roles as any, _id_document_type: "BI", _id_document_number: "TESTE-" + n, _birth_date: "1990-01-01", _address: "Rua de teste" });
  for (const [n, r] of [["memA1", ["membro"]], ["memA2", ["membro"]], ["tesA", ["tesoureiro", "membro"]], ["secA", ["secretario"]]] as const) {
    const { error } = await add(dirA, n, [...r]); check(`Diretor A cadastra ${n}`, !error, error?.message);
  }
  const { error: eDup } = await add(dirA, "memA1", ["membro"]);
  check("Email duplicado no mesmo grupo é recusado", !!eDup, eDup?.message);
  const cl: Record<string, SupabaseClient> = {};
  for (const n of ["memA1", "memA2", "tesA", "secA"]) {
    cl[n] = await login(n);
    const { data } = await cl[n].from("group_members").select("id").eq("user_id", users[n]);
    const { error } = await cl[n].rpc("accept_invitation", { _member_id: data![0].id });
    check(`${n} aceita convite`, !error, error?.message);
  }

  // Isolamento entre grupos
  for (const t of ["groups", "group_members", "group_member_roles", "member_private_data", "audit_log"] as const) {
    const col = t === "groups" ? "id" : "group_id";
    const { data } = await dirB.from(t).select("*").eq(col, gA as string);
    check(`Diretor B não vê ${t} do Grupo A`, (data?.length ?? 0) === 0, `linhas=${data?.length}`);
  }
  const { error: eCross } = await add(dirB, "intruso", ["membro"], gA as string);
  check("Diretor B não cadastra membros no Grupo A", !!eCross, eCross?.message);
  const { data: memA1row } = await dirA.from("group_members").select("id").eq("user_id", users.memA1).single();
  const { error: eCrossUpd } = await dirB.rpc("update_group_member", { _member_id: memA1row!.id, _full_name: "Hack", _phone: "", _profession: "", _id_document_type: "", _id_document_number: "", _birth_date: null as any, _address: "" });
  check("Diretor B não edita membro do Grupo A", !!eCrossUpd, eCrossUpd?.message);
  const { error: eCrossSt } = await dirB.rpc("request_member_status_change", { _member_id: memA1row!.id, _status: "suspenso", _reason: "teste" });
  check("Diretor B não pede suspensão de membro do Grupo A", !!eCrossSt, eCrossSt?.message);
  const { data: outG } = await outsider.from("groups").select("id");
  const { data: outM } = await outsider.from("group_members").select("id");
  check("Utilizador sem grupo não vê grupos nem membros", (outG?.length ?? 0) === 0 && (outM?.length ?? 0) === 0);
  const anon = createClient(URL, ANON, opts);
  const { data: anonG } = await anon.from("groups").select("id");
  const { data: anonP } = await anon.from("member_private_data").select("*");
  check("Visitante sem sessão não vê nada", (anonG?.length ?? 0) === 0 && (anonP?.length ?? 0) === 0);

  // Privacidade dentro do grupo
  const { data: m1Off } = await cl.memA1.from("group_members").select("id").eq("group_id", gA as string);
  check("Membro com lista desativada só se vê a si", m1Off?.length === 1);
  const { error: eSet } = await dirA.rpc("update_group_settings", { _group_id: gA, _name: "Grupo Teste A", _location: "Maputo", _official_phone: "", _official_email: "", _member_directory_visible: true });
  check("Diretor ativa lista de membros", !eSet, eSet?.message);
  const { data: m1On } = await cl.memA1.from("group_members").select("full_name,phone,profession").eq("group_id", gA as string);
  check("Membro vê os 5 membros ativos com a lista ativada", m1On?.length === 5, `linhas=${m1On?.length}`);
  const { data: m1Priv } = await cl.memA1.from("member_private_data").select("member_id,id_document_number");
  check("Membro só vê os próprios dados sensíveis", m1Priv?.length === 1 && m1Priv[0].id_document_number === "TESTE-memA1");
  const { data: m1Audit } = await cl.memA1.from("audit_log").select("id");
  check("Membro não vê o histórico de atividade", (m1Audit?.length ?? 0) === 0);
  const { data: tesPriv } = await cl.tesA.from("member_private_data").select("member_id");
  check("Tesoureiro vê dados sensíveis do seu grupo", tesPriv?.length === 5, `linhas=${tesPriv?.length}`);
  const { data: tesList } = await cl.tesA.from("group_members").select("id").eq("group_id", gA as string);
  check("Tesoureiro (administrador) vê todos os membros", tesList?.length === 5);
  const { data: secPriv } = await cl.secA.from("member_private_data").select("member_id").eq("group_id", gA as string);
  check("Secretário vê dados sensíveis do seu grupo", secPriv?.length === 5);
  const { data: dirAudit } = await dirA.from("audit_log").select("action").eq("group_id", gA as string);
  check("Diretor vê histórico de atividade", (dirAudit?.length ?? 0) >= 6, `ações=${dirAudit?.length}`);
  const { data: ownM } = await owner.from("group_members").select("id");
  const { data: ownP } = await owner.from("member_private_data").select("member_id");
  const { data: ownG } = await owner.from("groups").select("id").in("id", groupIds);
  check("AGROEI vê grupos mas não membros nem dados pessoais", ownG?.length === 2 && (ownM?.length ?? 0) === 0 && (ownP?.length ?? 0) === 0);

  // Cadastro obrigatório
  const incompleto = await dirA.rpc("add_group_member", { _group_id: gA, _full_name: "Pessoa incompleta", _email: mail("inc"), _phone: "840000009", _profession: "Agricultor", _roles: ["membro"] as any, _id_document_type: "BI", _id_document_number: "X1", _birth_date: "1990-01-01", _address: "" });
  check("Cadastro sem morada é recusado", !!incompleto.error, incompleto.error?.message);
  const semDoc = await dirA.rpc("add_group_member", { _group_id: gA, _full_name: "Pessoa sem doc", _email: mail("inc2"), _phone: "840000009", _profession: "Agricultor", _roles: ["membro"] as any, _id_document_type: "", _id_document_number: "", _birth_date: "1990-01-01", _address: "Rua" });
  check("Cadastro sem documento é recusado", !!semDoc.error, semDoc.error?.message);
  const { error: eUpdInc } = await dirA.rpc("update_group_member", { _member_id: memA1row!.id, _full_name: "Pessoa memA1", _phone: "", _profession: "Agricultor", _id_document_type: "BI", _id_document_number: "TESTE-memA1", _birth_date: "1990-01-01", _address: "Rua" });
  check("Edição que apaga o contacto é recusada", !!eUpdInc, eUpdInc?.message);

  // Permissões de cadastro
  await mkUser("novoMem");
  const { error: eSecMem } = await add(cl.secA, "novoMem", ["membro"]);
  check("Secretário cadastra membro comum", !eSecMem, eSecMem?.message);
  const { error: eMemAdd } = await add(cl.memA1, "x2", ["membro"]);
  check("Membro não cadastra membros", !!eMemAdd, eMemAdd?.message);
  const { error: eTesAdd } = await add(cl.tesA, "x3", ["membro"]);
  check("Tesoureiro não cadastra membros", !!eTesAdd, eTesAdd?.message);
  const { data: tesUpd, error: eTesUpd } = await cl.tesA.rpc("update_group_member", { _member_id: memA1row!.id, _full_name: "X", _phone: "1", _profession: "1", _id_document_type: "1", _id_document_number: "1", _birth_date: "1990-01-01", _address: "1" });
  check("Tesoureiro não edita membros", !!eTesUpd, eTesUpd?.message ?? String(tesUpd));
  const { data: novoTesId, error: eSecAdm } = await add(cl.secA, "novoTes", ["tesoureiro"]);
  const { data: novoTesRoles } = await dirA.from("group_member_roles").select("role").eq("member_id", novoTesId as string);
  const { data: novoTesReq } = await dirA.from("member_status_requests").select("kind,status").eq("member_id", novoTesId as string);
  check("Cargo indicado pelo Secretário no cadastro fica pendente da admissão", !eSecAdm && (novoTesRoles?.length ?? 0) === 0 && novoTesReq?.[0]?.kind === "admissao" && novoTesReq?.[0]?.status === "pendente", eSecAdm?.message);
  await dirA.rpc("cancel_member_status_request", { _request_id: (await dirA.from("member_status_requests").select("id").eq("member_id", novoTesId as string).single()).data!.id }).then(async () => {
    const { data: c } = await dirA.from("member_status_requests").select("status").eq("member_id", novoTesId as string).single();
    check("Só quem pediu pode cancelar (Diretor não cancela pedido do Secretário)", c?.status === "pendente");
  });
  const { data: secReq } = await cl.secA.from("member_status_requests").select("id").eq("member_id", novoTesId as string).single();
  const { error: eCancel } = await cl.secA.rpc("cancel_member_status_request", { _request_id: secReq!.id });
  check("Pedido de admissão não pode ser cancelado", !!eCancel, eCancel?.message);

  // Admissão com aprovação unânime (direção ativa: Diretor, Tesoureiro, Secretário; o Secretário cadastrou)
  cl.novoMem = await login("novoMem");
  const { data: nmRow } = await cl.novoMem.from("group_members").select("id,status").eq("user_id", users.novoMem).single();
  await cl.novoMem.rpc("accept_invitation", { _member_id: nmRow!.id });
  const { data: nmAfter } = await cl.novoMem.from("group_members").select("id,status").eq("group_id", gA as string);
  check("Quem aceita antes da aprovação fica 'pendente_aprovacao'", nmAfter?.length === 1 && nmAfter[0].status === "pendente_aprovacao", JSON.stringify(nmAfter));
  const { data: nmG } = await cl.novoMem.from("groups").select("id");
  const { data: nmHist } = await cl.novoMem.from("admin_role_history").select("id");
  const { data: nmBoard } = await cl.novoMem.rpc("group_board", { _group_id: gA as string });
  check("Pendente vê só o nome do grupo, sem dados do grupo", nmG?.length === 1 && (nmHist?.length ?? 0) === 0 && (nmBoard?.length ?? 0) === 0);
  const { data: admReq } = await dirA.from("member_status_requests").select("id").eq("member_id", nmRow!.id).eq("status", "pendente").single();
  const { data: a1 } = await dirA.rpc("vote_member_status_request", { _request_id: admReq!.id, _approve: true, _reason: "" });
  const { data: nmMid } = await dirA.from("group_members").select("status").eq("id", nmRow!.id).single();
  check("Com 2 de 3 aprovações a admissão continua pendente", a1 === "pendente" && nmMid?.status === "pendente_aprovacao", `${a1}/${nmMid?.status}`);
  const { data: a2 } = await cl.tesA.rpc("vote_member_status_request", { _request_id: admReq!.id, _approve: true, _reason: "" });
  const { data: nmEnd } = await dirA.from("group_members").select("status").eq("id", nmRow!.id).single();
  check("Com todos os administradores o membro fica ativo", a2 === "aprovado" && nmEnd?.status === "ativo", `${a2}/${nmEnd?.status}`);
  const { data: evMem } = await cl.memA1.from("group_events").select("kind,member_name").eq("group_id", gA as string);
  const { data: evB } = await dirB.from("group_events").select("id").eq("group_id", gA as string);
  check("Os membros do grupo são avisados da entrada; outro grupo não", (evMem ?? []).some((e) => e.kind === "membro_admitido" && e.member_name === "Pessoa novoMem") && (evB?.length ?? 0) === 0);
  const { data: rejId } = await add(cl.secA, "rejeitado", ["membro"]);
  const { data: rejReq } = await dirA.from("member_status_requests").select("id").eq("member_id", rejId as string).eq("status", "pendente").single();
  const { data: r1 } = await cl.tesA.rpc("vote_member_status_request", { _request_id: rejReq!.id, _approve: false, _reason: "Não cumpre os requisitos" });
  const { data: rejRow } = await dirA.from("group_members").select("status").eq("id", rejId as string).single();
  check("Uma rejeição exclui o candidato definitivamente", r1 === "rejeitado" && rejRow?.status === "excluido", `${r1}/${rejRow?.status}`);

  // Beneficiário por morte (confidencial)
  const memA1Id = memA1row!.id;
  const { error: eBen } = await cl.memA1.rpc("set_my_beneficiary", { _member_id: memA1Id, _full_name: "Herdeira Teste", _relationship: "Filha", _phone: "840009999", _document_type: "bi", _document_number: "BI-HER-1" });
  check("Membro indica o seu beneficiário", !eBen, eBen?.message);
  await cl.memA1.rpc("set_my_beneficiary", { _member_id: memA1Id, _full_name: "Herdeira Teste", _relationship: "Filha", _phone: "840009998", _document_type: "passaporte", _document_number: "P-1" });
  const { data: benHist } = await cl.memA1.from("member_beneficiary_history").select("id").eq("member_id", memA1Id);
  check("Cada alteração fica no histórico", benHist?.length === 2, `linhas=${benHist?.length}`);
  const { data: benM2 } = await cl.memA2.from("member_beneficiaries").select("member_id");
  const { data: benM2h } = await cl.memA2.from("member_beneficiary_history").select("id");
  check("Outros membros não veem o beneficiário", (benM2?.length ?? 0) === 0 && (benM2h?.length ?? 0) === 0);
  const { data: benTes } = await cl.tesA.from("member_beneficiaries").select("full_name").eq("member_id", memA1Id);
  const { data: benSec } = await cl.secA.from("member_beneficiary_history").select("id").eq("member_id", memA1Id);
  check("A direção vê o beneficiário e o histórico", benTes?.length === 1 && benSec?.length === 2);
  const { data: benB } = await dirB.from("member_beneficiaries").select("member_id").eq("group_id", gA as string);
  const { data: benOwn } = await owner.from("member_beneficiaries").select("member_id");
  check("Outro grupo e AGROEI não veem beneficiários", (benB?.length ?? 0) === 0 && (benOwn?.length ?? 0) === 0);
  const { error: eBenOther } = await cl.memA2.rpc("set_my_beneficiary", { _member_id: memA1Id, _full_name: "Intruso", _relationship: "X", _phone: "1", _document_type: "bi", _document_number: "1" });
  const { error: eBenDir } = await dirA.rpc("set_my_beneficiary", { _member_id: memA1Id, _full_name: "Intruso", _relationship: "X", _phone: "1", _document_type: "bi", _document_number: "1" });
  check("Ninguém altera o beneficiário de outra pessoa (nem a direção)", !!eBenOther && !!eBenDir);
  const { error: eBenDoc } = await cl.memA1.rpc("set_my_beneficiary", { _member_id: memA1Id, _full_name: "Herdeira", _relationship: "Filha", _phone: "1", _document_type: "nuit", _document_number: "1" });
  check("Só aceita BI, Cédula, Cartão de Eleitor, Carta de condução ou Passaporte", !!eBenDoc, eBenDoc?.message);

  // Perfis coletivos (uma cota)
  const { data: profId, error: eProf } = await cl.secA.rpc("create_collective_profile", { _group_id: gA, _name: "Família Teste", _relation_type: "familia" });
  check("Secretário cria perfil coletivo", !eProf && !!profId, eProf?.message);
  const { error: eProfMem } = await cl.memA1.rpc("create_collective_profile", { _group_id: gA, _name: "Amigos X", _relation_type: "amigos" });
  check("Membro não cria perfil coletivo", !!eProfMem, eProfMem?.message);
  const { data: memA2r } = await dirA.from("group_members").select("id").eq("user_id", users.memA2).single();
  await cl.secA.rpc("set_member_collective_profile", { _member_id: memA1Id, _profile_id: profId as string });
  const { error: eAssign } = await cl.secA.rpc("set_member_collective_profile", { _member_id: memA2r!.id, _profile_id: profId as string });
  const { data: sumMem } = await cl.memA1.rpc("group_collective_profiles", { _group_id: gA as string });
  check("Membros veem o perfil com o número de integrantes", !eAssign && sumMem?.length === 1 && sumMem[0].member_count === 2 && sumMem[0].name === "Família Teste", JSON.stringify(sumMem));
  const { data: integ } = await cl.memA1.from("group_members").select("full_name").eq("collective_profile_id", profId as string);
  check("Membros veem quem compõe o perfil", integ?.length === 2);
  const { data: sumB } = await dirB.rpc("group_collective_profiles", { _group_id: gA as string });
  const { data: profB } = await dirB.from("collective_profiles").select("id").eq("group_id", gA as string);
  check("Outro grupo não vê perfis coletivos", (sumB?.length ?? 0) === 0 && (profB?.length ?? 0) === 0);
  const { data: profBId } = await dirB.rpc("create_collective_profile", { _group_id: gB, _name: "Colegas B", _relation_type: "colegas" });
  const { error: eCrossProf } = await cl.secA.rpc("set_member_collective_profile", { _member_id: memA1Id, _profile_id: profBId as string });
  const { error: eCrossProf2 } = await dirB.rpc("set_member_collective_profile", { _member_id: memA1Id, _profile_id: profBId as string });
  check("Não se mistura membros e perfis de grupos diferentes", !!eCrossProf && !!eCrossProf2);

  // Pedidos de estado com aprovação da direção (3 administradores: Diretor, Tesoureiro, Secretário)
  const { data: memA2row } = await dirA.from("group_members").select("id").eq("user_id", users.memA2).single();
  const { error: eMemSt } = await cl.memA1.rpc("request_member_status_change", { _member_id: memA2row!.id, _status: "suspenso", _reason: "teste" });
  check("Membro não pede suspensão", !!eMemSt, eMemSt?.message);
  const { data: st1, error: eTesReq } = await cl.tesA.rpc("request_member_status_change", { _member_id: memA2row!.id, _status: "suspenso", _reason: "Faltas repetidas" });
  check("Tesoureiro pede suspensão; fica pendente com 3 administradores", !eTesReq && st1 === "pendente", eTesReq?.message ?? String(st1));
  const { error: eNoReason } = await cl.secA.rpc("request_member_status_change", { _member_id: memA1row!.id, _status: "suspenso", _reason: "  " });
  check("Pedido sem motivo é recusado", !!eNoReason, eNoReason?.message);
  const { error: eDupReq } = await dirA.rpc("request_member_status_change", { _member_id: memA2row!.id, _status: "excluido", _reason: "Outro" });
  check("Só um pedido pendente por membro", !!eDupReq, eDupReq?.message);
  const { data: reqMem } = await cl.memA1.from("member_status_requests").select("id");
  const { data: reqB } = await dirB.from("member_status_requests").select("id").eq("group_id", gA as string);
  check("Membro e outro grupo não veem pedidos da direção", (reqMem?.length ?? 0) === 0 && (reqB?.length ?? 0) === 0);
  const { data: req1 } = await dirA.from("member_status_requests").select("id").eq("member_id", memA2row!.id).eq("status", "pendente").single();
  const { error: eVoteB } = await dirB.rpc("vote_member_status_request", { _request_id: req1!.id, _approve: true, _reason: "" });
  check("Diretor B não vota em pedido do Grupo A", !!eVoteB, eVoteB?.message);
  const { error: eVoteMem } = await cl.memA1.rpc("vote_member_status_request", { _request_id: req1!.id, _approve: true, _reason: "" });
  check("Membro não vota", !!eVoteMem, eVoteMem?.message);
  const { data: v1 } = await dirA.rpc("vote_member_status_request", { _request_id: req1!.id, _approve: true, _reason: "" });
  check("Com Diretor e Tesoureiro ainda falta o Secretário", v1 === "pendente", String(v1));
  const { data: still } = await dirA.from("group_members").select("status").eq("id", memA2row!.id).single();
  check("Membro continua ativo enquanto o pedido está pendente", still?.status === "ativo");
  const { error: eTwice } = await dirA.rpc("vote_member_status_request", { _request_id: req1!.id, _approve: true, _reason: "" });
  check("Ninguém vota duas vezes", !!eTwice, eTwice?.message);
  const { data: v2 } = await cl.secA.rpc("vote_member_status_request", { _request_id: req1!.id, _approve: true, _reason: "" });
  const { data: m2st } = await dirA.from("group_members").select("status").eq("id", memA2row!.id).single();
  check("Com os 3 principais o membro é suspenso", v2 === "aprovado" && m2st?.status === "suspenso", `${v2}/${m2st?.status}`);
  const { data: m2Groups } = await cl.memA2.from("groups").select("id");
  check("Membro suspenso perde acesso ao grupo", (m2Groups?.length ?? 0) === 0);

  const { data: st2 } = await cl.secA.rpc("request_member_status_change", { _member_id: memA1row!.id, _status: "excluido", _reason: "Teste de rejeição" });
  const { data: req2 } = await dirA.from("member_status_requests").select("id").eq("member_id", memA1row!.id).eq("status", "pendente").single();
  const { error: eRejNo } = await cl.tesA.rpc("vote_member_status_request", { _request_id: req2!.id, _approve: false, _reason: "" });
  check("Rejeitar exige motivo", !!eRejNo, eRejNo?.message);
  const { data: v3 } = await cl.tesA.rpc("vote_member_status_request", { _request_id: req2!.id, _approve: false, _reason: "Não concordo" });
  const { data: m1st } = await dirA.from("group_members").select("status").eq("id", memA1row!.id).single();
  check("Uma rejeição rejeita o pedido", st2 === "pendente" && v3 === "rejeitado" && m1st?.status === "ativo", `${st2}/${v3}/${m1st?.status}`);

  const { data: dirArow } = await dirA.from("group_members").select("id").eq("user_id", users.dirA).single();
  const { error: eSelf } = await dirA.rpc("request_member_status_change", { _member_id: dirArow!.id, _status: "suspenso", _reason: "teste" });
  check("Ninguém pede a alteração do próprio estado", !!eSelf, eSelf?.message);
  const { error: eLast } = await cl.tesA.rpc("request_member_roles_change", { _member_id: dirArow!.id, _roles: ["membro"] as any, _reason: "teste" });
  check("Grupo mantém pelo menos um Diretor ativo", !!eLast, eLast?.message);
  const { error: eSelfRole } = await dirA.rpc("request_member_roles_change", { _member_id: dirArow!.id, _roles: ["diretor", "tesoureiro"] as any, _reason: "teste" });
  check("Ninguém propõe os próprios cargos", !!eSelfRole, eSelfRole?.message);

  // Promoção com aprovação da direção
  const { data: p1 } = await dirA.rpc("request_member_roles_change", { _member_id: memA1row!.id, _roles: ["secretario", "membro"] as any, _reason: "Reforço da secretaria" });
  const { data: reqP } = await dirA.from("member_status_requests").select("id").eq("member_id", memA1row!.id).eq("status", "pendente").single();
  await cl.tesA.rpc("vote_member_status_request", { _request_id: reqP!.id, _approve: true, _reason: "" });
  const { data: p3 } = await cl.secA.rpc("vote_member_status_request", { _request_id: reqP!.id, _approve: true, _reason: "" });
  const { data: m1roles } = await dirA.from("group_member_roles").select("role").eq("member_id", memA1row!.id);
  check("Promoção aplica-se só depois da aprovação dos 3 principais", p1 === "pendente" && p3 === "aprovado" && (m1roles ?? []).some((r) => r.role === "secretario"), `${p1}/${p3}`);

  // 4 administradores: bastam os 3 principais
  const { data: novoMemRow } = await dirA.from("group_members").select("id").eq("full_name", "Pessoa novoMem").single();
  await dirA.rpc("request_member_status_change", { _member_id: novoMemRow!.id, _status: "suspenso", _reason: "Teste com 4" });
  const { data: req4 } = await dirA.from("member_status_requests").select("id").eq("member_id", novoMemRow!.id).eq("status", "pendente").single();
  await cl.secA.rpc("vote_member_status_request", { _request_id: req4!.id, _approve: true, _reason: "" });
  const { data: q2 } = await cl.memA1.rpc("vote_member_status_request", { _request_id: req4!.id, _approve: true, _reason: "" });
  check("Com 4 administradores, 3 votos sem o Tesoureiro não chegam", q2 === "pendente", String(q2));
  const { data: q3 } = await cl.tesA.rpc("vote_member_status_request", { _request_id: req4!.id, _approve: true, _reason: "" });
  check("Com o Tesoureiro, o pedido é aprovado", q3 === "aprovado", String(q3));

  // Histórico da direção
  const { data: histMem } = await cl.memA1.from("admin_role_history").select("member_name,role,action").eq("group_id", gA as string);
  check("Membros do grupo veem o histórico da direção", (histMem ?? []).some((h) => h.member_name === "Pessoa memA1" && h.role === "secretario" && h.action === "atribuido"), `linhas=${histMem?.length}`);
  const { data: histB } = await dirB.from("admin_role_history").select("id").eq("group_id", gA as string);
  const { data: histOwner } = await owner.from("admin_role_history").select("id");
  check("Outro grupo e AGROEI não veem o histórico da direção", (histB?.length ?? 0) === 0 && (histOwner?.length ?? 0) === 0);
  const { data: boardMem } = await cl.memA1.rpc("group_board", { _group_id: gA as string });
  const { data: boardB } = await dirB.rpc("group_board", { _group_id: gA as string });
  check("Direção atual visível aos membros, não a outros grupos", (boardMem?.length ?? 0) === 4 && (boardB?.length ?? 0) === 0, `${boardMem?.length}/${boardB?.length}`);
  const { error: eDirReq } = await dirA.from("member_status_requests").insert({ group_id: gA, member_id: memA1row!.id, kind: "estado", from_status: "ativo", requested_status: "excluido", reason: "direto", requested_by: users.dirA, requested_by_member: dirArow!.id } as any);
  check("Pedidos não podem ser criados por escrita direta", !!eDirReq, eDirReq?.message);

  // Escrita direta bloqueada
  const { error: eIns } = await dirA.from("groups").insert({ name: "Direto" });
  const { error: eUpd, data: upd } = await dirA.from("group_members").update({ full_name: "Mudado" }).eq("id", memA1row!.id).select();
  const { error: eDel, data: del } = await dirA.from("group_members").delete().eq("id", memA1row!.id).select();
  check("Escrita direta nas tabelas é bloqueada (só via funções seguras)", !!eIns && (!!eUpd || (upd?.length ?? 0) === 0) && (!!eDel || (del?.length ?? 0) === 0));
  const { error: ePlat } = await dirA.from("platform_roles").insert({ user_id: users.dirA, role: "agroei_owner" });
  check("Utilizador não se promove a AGROEI", !!ePlat, ePlat?.message);

  // Convite antes de criar conta
  const { error: eLate } = await add(dirA, "tardio", ["membro"]);
  await mkUser("tardio");
  const tardio = await login("tardio");
  const { data: tInv } = await tardio.from("group_members").select("status");
  check("Convite feito antes do registo liga-se à nova conta", !eLate && tInv?.length === 1 && tInv[0].status === "convidado");
  const { data: tG } = await tardio.from("groups").select("name");
  check("Convidado vê apenas o nome do grupo que o convidou", tG?.length === 1);
} catch (e) { check("Execução sem erros", false, String((e as Error).message ?? e)); }
finally {
  if (groupIds.length) {
    for (const t of ["audit_log", "admin_role_history", "group_events", "member_beneficiary_history", "member_beneficiaries", "member_status_request_votes", "member_status_requests", "group_member_roles", "member_private_data", "group_members", "collective_profiles"]) await admin.from(t).delete().in("group_id", groupIds);
    await admin.from("groups").delete().in("id", groupIds);
  }
  for (const id of Object.values(users)) await admin.auth.admin.deleteUser(id);
  const { data: left } = await admin.from("groups").select("id").in("id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"]);
  results.push(`Limpeza: grupos de teste restantes=${left?.length ?? 0}`);
}
console.log(results.join("\n")); console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
