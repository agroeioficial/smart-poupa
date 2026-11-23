-- ===================== Tipos =====================
create type public.loan_status as enum ('submetido','em_analise','aprovado','rejeitado','cancelado','desembolsado','em_pagamento','liquidado','em_incumprimento');

-- ===================== Pedidos de empréstimo =====================
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  member_id uuid not null references public.group_members(id) on delete restrict,
  requested_by uuid not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 100000000),
  term_months int not null check (term_months between 1 and 120),
  purpose text not null check (char_length(btrim(purpose)) between 5 and 1000),
  guarantee_description text check (guarantee_description is null or char_length(guarantee_description) <= 1000),
  guarantee_path text,
  declaration_path text not null,
  status public.loan_status not null default 'submetido',
  decided_at timestamptz,
  rejection_reason text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loans_group_status_idx on public.loans(group_id, status, created_at desc);
create index loans_member_idx on public.loans(member_id);
grant select on public.loans to authenticated;
grant all on public.loans to service_role;
alter table public.loans enable row level security;
create policy "loans_select" on public.loans for select to authenticated using (
  public.is_group_admin(auth.uid(), group_id) or public.is_own_member(auth.uid(), member_id)
);
create trigger loans_updated_at before update on public.loans
for each row execute function public.set_updated_at();

-- ===================== Votos da direção =====================
create table public.loan_votes (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  voter_member_id uuid not null references public.group_members(id) on delete restrict,
  voter_user_id uuid not null,
  vote public.vote_choice not null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (loan_id, voter_member_id),
  constraint loan_votes_reject_reason check (vote = 'aprovado' or (reason is not null and char_length(btrim(reason)) >= 3))
);
create index loan_votes_group_idx on public.loan_votes(group_id);
create index loan_votes_voter_idx on public.loan_votes(voter_member_id);
grant select on public.loan_votes to authenticated;
grant all on public.loan_votes to service_role;
alter table public.loan_votes enable row level security;
create policy "loan_votes_select" on public.loan_votes for select to authenticated using (
  public.is_group_admin(auth.uid(), group_id)
);

-- ===================== Imutabilidade =====================
create or replace function public._guard_loan()
returns trigger language plpgsql set search_path = public as $$
begin
  if public._purge_allowed() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    raise exception 'Pedidos de empréstimo não podem ser apagados.' using errcode = '42501';
  end if;
  if new.group_id <> old.group_id or new.member_id <> old.member_id or new.requested_by <> old.requested_by
     or new.amount <> old.amount or new.term_months <> old.term_months or new.purpose <> old.purpose
     or new.guarantee_description is distinct from old.guarantee_description
     or new.guarantee_path is distinct from old.guarantee_path or new.declaration_path <> old.declaration_path
     or new.created_at <> old.created_at then
    raise exception 'Os dados do pedido de empréstimo não podem ser alterados.' using errcode = '42501';
  end if;
  if old.status in ('rejeitado','cancelado') then
    raise exception 'Este pedido de empréstimo já foi encerrado.' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger loans_immutable before update or delete on public.loans
for each row execute function public._guard_loan();

create or replace function public._guard_loan_vote()
returns trigger language plpgsql set search_path = public as $$
begin
  if public._purge_allowed() then return coalesce(new, old); end if;
  raise exception 'Votos registados não podem ser alterados nem apagados.' using errcode = '42501';
end; $$;
create trigger loan_votes_immutable before update or delete on public.loan_votes
for each row execute function public._guard_loan_vote();

-- ===================== Regra de aprovação =====================
-- Quem vota: todos os administradores ativos do grupo, exceto o próprio requerente.
create or replace function public._loan_voters(_group uuid, _borrower uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct gm.id), '{}') from public.group_members gm
  join public.group_member_roles gr on gr.member_id = gm.id
  where gm.group_id = _group and gm.status = 'ativo' and gm.id <> _borrower
    and gr.role in ('diretor','tesoureiro','secretario')
$$;

-- Unanimidade: uma rejeição rejeita; aprovado quando todos os votantes aprovaram.
create or replace function public._loan_vote_state(_loan_id uuid)
returns public.loan_status language plpgsql stable security definer set search_path = public as $$
declare _l public.loans%rowtype; _eligible uuid[]; _approvals int;
begin
  select * into _l from public.loans where id = _loan_id;
  if _l.status not in ('submetido','em_analise') then return _l.status; end if;
  if exists (select 1 from public.loan_votes where loan_id = _l.id and vote = 'rejeitado') then
    return 'rejeitado';
  end if;
  _eligible := public._loan_voters(_l.group_id, _l.member_id);
  if cardinality(_eligible) > 0 then
    select count(*) into _approvals from public.loan_votes
     where loan_id = _l.id and vote = 'aprovado' and voter_member_id = any(_eligible);
    if _approvals >= cardinality(_eligible) then return 'aprovado'; end if;
  end if;
  if exists (select 1 from public.loan_votes where loan_id = _l.id) then return 'em_analise'; end if;
  return 'submetido';
end; $$;

-- ===================== Funções: pedidos =====================
create or replace function public.submit_loan_request(
  _group_id uuid, _amount numeric, _term_months int, _purpose text, _declaration_path text,
  _guarantee_description text default null, _guarantee_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _me public.group_members%rowtype; _id uuid; _p text; _gpath text;
begin
  select * into _me from public.group_members where user_id = _uid and group_id = _group_id and status = 'ativo';
  if _uid is null or _me.id is null then
    raise exception 'Só membros ativos do grupo podem pedir empréstimos.' using errcode = '42501';
  end if;
  if _amount is null or _amount <= 0 or _amount > 100000000 or _amount <> round(_amount, 2) then
    raise exception 'Indique um valor válido em MZN (até 2 casas decimais).' using errcode = '22023';
  end if;
  if _term_months is null or _term_months < 1 or _term_months > 120 then
    raise exception 'Indique o prazo em meses (de 1 a 120).' using errcode = '22023';
  end if;
  perform public._req(_purpose, 'A finalidade');
  if char_length(btrim(_purpose)) < 5 or char_length(btrim(_purpose)) > 1000 then
    raise exception 'Descreva a finalidade (entre 5 e 1000 caracteres).' using errcode = '22023';
  end if;
  if char_length(coalesce(_guarantee_description, '')) > 1000 then
    raise exception 'A descrição da garantia não pode ter mais de 1000 caracteres.' using errcode = '22023';
  end if;
  perform public._req(_declaration_path, 'A declaração de dívida e compromisso');
  _gpath := nullif(btrim(coalesce(_guarantee_path, '')), '');
  if _gpath = _declaration_path then
    raise exception 'A garantia e a declaração devem ser ficheiros diferentes.' using errcode = '22023';
  end if;
  foreach _p in array array_remove(array[_declaration_path, _gpath], null) loop
    if split_part(_p, '/', 1) <> _group_id::text or split_part(_p, '/', 2) <> _uid::text
       or not exists (select 1 from storage.objects where bucket_id = 'comprovativos' and name = _p) then
      raise exception 'Documento não encontrado. Volte a anexar o ficheiro.' using errcode = '22023';
    end if;
    if exists (select 1 from public.deposits where receipt_path = _p)
       or exists (select 1 from public.loans where declaration_path = _p or guarantee_path = _p) then
      raise exception 'Este ficheiro já foi usado noutro registo.' using errcode = '23505';
    end if;
  end loop;
  if cardinality(public._loan_voters(_group_id, _me.id)) = 0 then
    raise exception 'O grupo precisa de pelo menos outro administrador ativo para decidir o pedido.' using errcode = '22023';
  end if;
  insert into public.loans(group_id, member_id, requested_by, amount, term_months, purpose,
                           guarantee_description, guarantee_path, declaration_path)
  values (_group_id, _me.id, _uid, _amount, _term_months, btrim(_purpose),
          nullif(btrim(coalesce(_guarantee_description, '')), ''), _gpath, _declaration_path)
  returning id into _id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'emprestimo_pedido', 'loan', _id,
          jsonb_build_object('valor', _amount, 'prazo_meses', _term_months, 'estado_novo', 'submetido',
                             'declaracao', _declaration_path, 'garantia', _gpath));
  return _id;
end; $$;

create or replace function public.vote_loan(_loan_id uuid, _approve boolean, _reason text default null)
returns public.loan_status language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _l public.loans%rowtype; _me uuid; _new public.loan_status;
begin
  select * into _l from public.loans where id = _loan_id for update;
  if _l.id is null or _uid is null or not public.is_group_admin(_uid, _l.group_id) then
    raise exception 'Só a direção do grupo vota nos pedidos de empréstimo.' using errcode = '42501';
  end if;
  if _l.status not in ('submetido','em_analise') then
    raise exception 'Este pedido já foi decidido.' using errcode = '22023';
  end if;
  _me := public._active_member_id(_uid, _l.group_id);
  if _me = _l.member_id then
    raise exception 'Não pode votar no seu próprio pedido de empréstimo.' using errcode = '42501';
  end if;
  if exists (select 1 from public.loan_votes where loan_id = _l.id and voter_member_id = _me) then
    raise exception 'Já votou neste pedido.' using errcode = '23505';
  end if;
  if not _approve then perform public._req(_reason, 'O motivo da rejeição'); end if;
  insert into public.loan_votes(loan_id, group_id, voter_member_id, voter_user_id, vote, reason)
  values (_l.id, _l.group_id, _me, _uid,
          case when _approve then 'aprovado'::public.vote_choice else 'rejeitado'::public.vote_choice end,
          nullif(btrim(coalesce(_reason, '')), ''));
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_l.group_id, _uid, case when _approve then 'emprestimo_voto_aprovado' else 'emprestimo_voto_rejeitado' end,
          'loan', _l.id, jsonb_build_object('valor', _l.amount, 'motivo', nullif(btrim(coalesce(_reason, '')), '')));
  _new := public._loan_vote_state(_l.id);
  if _new <> _l.status then
    update public.loans
       set status = _new,
           decided_at = case when _new in ('aprovado','rejeitado') then now() end,
           rejection_reason = case when _new = 'rejeitado' then btrim(_reason) end
     where id = _l.id;
    if _new in ('aprovado','rejeitado') then
      insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
      values (_l.group_id, _uid, case when _new = 'aprovado' then 'emprestimo_aprovado' else 'emprestimo_rejeitado' end,
              'loan', _l.id, jsonb_build_object('valor', _l.amount, 'estado_anterior', _l.status, 'estado_novo', _new,
                                                'motivo', case when _new = 'rejeitado' then btrim(_reason) end));
    end if;
  end if;
  return _new;
end; $$;

create or replace function public.cancel_loan_request(_loan_id uuid, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _l public.loans%rowtype;
begin
  select * into _l from public.loans where id = _loan_id for update;
  if _l.id is null or _uid is null or _l.requested_by <> _uid or not public.is_own_member(_uid, _l.member_id) then
    raise exception 'Só quem pediu pode cancelar o pedido.' using errcode = '42501';
  end if;
  if _l.status not in ('submetido','em_analise') then
    raise exception 'Este pedido já foi decidido e não pode ser cancelado.' using errcode = '22023';
  end if;
  update public.loans set status = 'cancelado', cancel_reason = nullif(btrim(coalesce(_reason, '')), '')
   where id = _l.id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_l.group_id, _uid, 'emprestimo_cancelado', 'loan', _l.id,
          jsonb_build_object('valor', _l.amount, 'estado_anterior', _l.status, 'estado_novo', 'cancelado',
                             'motivo', nullif(btrim(coalesce(_reason, '')), '')));
end; $$;

-- ===================== Limpeza de grupos de teste (só service role) =====================
create or replace function public.purge_test_group_finance(_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.member_private_data where group_id = _group_id and email not like '%@exemplo.test') then
    raise exception 'Só grupos de teste podem ser limpos.' using errcode = '42501';
  end if;
  perform set_config('smartpoupa.purge', 'on', true);
  delete from public.loan_votes where group_id = _group_id;
  delete from public.loans where group_id = _group_id;
  delete from public.savings_ledger where group_id = _group_id and reverses_entry_id is not null;
  delete from public.savings_ledger where group_id = _group_id;
  delete from public.deposits where group_id = _group_id;
  delete from public.group_payment_accounts where group_id = _group_id;
end; $$;

-- ===================== Permissões de execução =====================
revoke execute on function public._guard_loan() from public, anon, authenticated;
revoke execute on function public._guard_loan_vote() from public, anon, authenticated;
revoke execute on function public._loan_voters(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._loan_vote_state(uuid) from public, anon, authenticated;
revoke execute on function public.purge_test_group_finance(uuid) from public, anon, authenticated;
grant execute on function public.purge_test_group_finance(uuid) to service_role;
revoke execute on function public.submit_loan_request(uuid, numeric, int, text, text, text, text) from public, anon;
revoke execute on function public.vote_loan(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_loan_request(uuid, text) from public, anon;
grant execute on function public.submit_loan_request(uuid, numeric, int, text, text, text, text) to authenticated;
grant execute on function public.vote_loan(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_loan_request(uuid, text) to authenticated;