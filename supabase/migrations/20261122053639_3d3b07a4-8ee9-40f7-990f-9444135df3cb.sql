-- ===================== Tipos =====================
create type public.deposit_status as enum ('pendente','aprovado','rejeitado');
create type public.payment_channel as enum ('mpesa','emola','mkesh','banco');

-- ===================== Auxiliares =====================
create or replace function public.is_finance_admin(_uid uuid, _group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_group_role(_uid, _group, 'diretor') or public.has_group_role(_uid, _group, 'tesoureiro')
$$;

create or replace function public._try_uuid(_t text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
  return _t::uuid;
exception when others then
  return null;
end; $$;

create or replace function public._purge_allowed()
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('smartpoupa.purge', true), '') = 'on'
$$;

-- ===================== Contas / carteiras do grupo =====================
create table public.group_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  channel public.payment_channel not null,
  institution text,
  account_number text not null check (char_length(btrim(account_number)) between 3 and 60),
  holder_name text not null check (char_length(btrim(holder_name)) between 2 and 120),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index group_payment_accounts_group_idx on public.group_payment_accounts(group_id);
grant select on public.group_payment_accounts to authenticated;
grant all on public.group_payment_accounts to service_role;
alter table public.group_payment_accounts enable row level security;
create policy "group_payment_accounts_select" on public.group_payment_accounts for select to authenticated using (
  public.is_active_member(auth.uid(), group_id)
);
create trigger group_payment_accounts_updated_at before update on public.group_payment_accounts
for each row execute function public.set_updated_at();

-- ===================== Depósitos =====================
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  member_id uuid references public.group_members(id) on delete restrict,
  collective_profile_id uuid references public.collective_profiles(id) on delete restrict,
  submitted_by uuid not null,
  submitted_by_member uuid not null references public.group_members(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0 and amount <= 100000000),
  deposit_date date not null,
  channel public.payment_channel not null,
  payment_account_id uuid references public.group_payment_accounts(id) on delete restrict,
  transaction_ref text not null check (char_length(btrim(transaction_ref)) between 3 and 80),
  receipt_path text not null,
  notes text check (notes is null or char_length(notes) <= 500),
  status public.deposit_status not null default 'pendente',
  reviewed_by uuid,
  reviewed_by_member uuid references public.group_members(id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  constraint deposits_one_target check ((member_id is null) <> (collective_profile_id is null))
);
create index deposits_group_status_idx on public.deposits(group_id, status, created_at desc);
create index deposits_member_idx on public.deposits(member_id);
create index deposits_collective_idx on public.deposits(collective_profile_id);
create index deposits_submitter_idx on public.deposits(submitted_by_member);
create index deposits_account_idx on public.deposits(payment_account_id);
create index deposits_reviewer_idx on public.deposits(reviewed_by_member);
create unique index deposits_unique_ref on public.deposits(group_id, channel, lower(btrim(transaction_ref))) where status <> 'rejeitado';
grant select on public.deposits to authenticated;
grant all on public.deposits to service_role;
alter table public.deposits enable row level security;
create policy "deposits_select" on public.deposits for select to authenticated using (
  public.is_finance_admin(auth.uid(), group_id)
  or submitted_by = auth.uid()
  or (member_id is not null and public.is_own_member(auth.uid(), member_id))
  or (collective_profile_id is not null and public._in_collective(auth.uid(), collective_profile_id))
);

-- ===================== Movimentos confirmados (só acrescentar) =====================
create table public.savings_ledger (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  member_id uuid references public.group_members(id) on delete restrict,
  collective_profile_id uuid references public.collective_profiles(id) on delete restrict,
  kind text not null check (kind in ('deposito','estorno')),
  amount numeric(14,2) not null check (amount <> 0),
  deposit_id uuid not null references public.deposits(id) on delete restrict,
  reverses_entry_id uuid references public.savings_ledger(id) on delete restrict,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint savings_ledger_one_target check ((member_id is null) <> (collective_profile_id is null)),
  constraint savings_ledger_kind_sign check (
    (kind = 'deposito' and amount > 0 and reverses_entry_id is null)
    or (kind = 'estorno' and amount < 0 and reverses_entry_id is not null and reason is not null))
);
create index savings_ledger_group_idx on public.savings_ledger(group_id, created_at desc);
create index savings_ledger_member_idx on public.savings_ledger(member_id);
create index savings_ledger_collective_idx on public.savings_ledger(collective_profile_id);
create index savings_ledger_deposit_idx on public.savings_ledger(deposit_id);
create unique index savings_ledger_one_deposit_entry on public.savings_ledger(deposit_id) where kind = 'deposito';
create unique index savings_ledger_one_reversal on public.savings_ledger(reverses_entry_id) where reverses_entry_id is not null;
grant select on public.savings_ledger to authenticated;
grant all on public.savings_ledger to service_role;
alter table public.savings_ledger enable row level security;
create policy "savings_ledger_select" on public.savings_ledger for select to authenticated using (
  public.is_finance_admin(auth.uid(), group_id)
  or (member_id is not null and public.is_own_member(auth.uid(), member_id))
  or (collective_profile_id is not null and public._in_collective(auth.uid(), collective_profile_id))
);

-- ===================== Imutabilidade =====================
create or replace function public._guard_ledger()
returns trigger language plpgsql set search_path = public as $$
begin
  if public._purge_allowed() then return coalesce(new, old); end if;
  raise exception 'Movimentos confirmados não podem ser alterados nem apagados; use um estorno.' using errcode = '42501';
end; $$;
create trigger savings_ledger_immutable before update or delete on public.savings_ledger
for each row execute function public._guard_ledger();

create or replace function public._guard_deposit()
returns trigger language plpgsql set search_path = public as $$
begin
  if public._purge_allowed() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    raise exception 'Depósitos não podem ser apagados.' using errcode = '42501';
  end if;
  if old.status <> 'pendente' then
    raise exception 'Depósitos já decididos não podem ser alterados.' using errcode = '42501';
  end if;
  if new.group_id is distinct from old.group_id or new.member_id is distinct from old.member_id
     or new.collective_profile_id is distinct from old.collective_profile_id or new.amount <> old.amount
     or new.deposit_date <> old.deposit_date or new.channel <> old.channel
     or new.transaction_ref <> old.transaction_ref or new.receipt_path <> old.receipt_path
     or new.submitted_by <> old.submitted_by or new.submitted_by_member <> old.submitted_by_member
     or new.payment_account_id is distinct from old.payment_account_id or new.created_at <> old.created_at then
    raise exception 'Os dados do depósito não podem ser alterados.' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger deposits_immutable before update or delete on public.deposits
for each row execute function public._guard_deposit();

create or replace function public._guard_payment_account()
returns trigger language plpgsql set search_path = public as $$
begin
  if public._purge_allowed() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    raise exception 'Contas do grupo não podem ser apagadas; desative-as.' using errcode = '42501';
  end if;
  if new.channel <> old.channel or new.account_number <> old.account_number or new.holder_name <> old.holder_name
     or new.institution is distinct from old.institution or new.group_id <> old.group_id then
    raise exception 'Os dados da conta não podem ser alterados; crie uma nova e desative esta.' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger group_payment_accounts_immutable before update or delete on public.group_payment_accounts
for each row execute function public._guard_payment_account();

-- ===================== Funções: contas do grupo =====================
create or replace function public.create_payment_account(
  _group_id uuid, _channel public.payment_channel, _institution text, _account_number text, _holder_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _id uuid;
begin
  if _uid is null or not public.is_finance_admin(_uid, _group_id) then
    raise exception 'Só o Diretor ou o Tesoureiro gerem as contas do grupo.' using errcode = '42501';
  end if;
  perform public._req(_account_number, 'O número da conta/carteira');
  perform public._req(_holder_name, 'O titular');
  if _channel = 'banco' then perform public._req(_institution, 'O nome do banco'); end if;
  insert into public.group_payment_accounts(group_id, channel, institution, account_number, holder_name, created_by)
  values (_group_id, _channel, nullif(btrim(coalesce(_institution, '')), ''), btrim(_account_number), btrim(_holder_name), _uid)
  returning id into _id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'conta_pagamento_criada', 'group_payment_account', _id, jsonb_build_object('canal', _channel));
  return _id;
end; $$;

create or replace function public.set_payment_account_active(_account_id uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid;
begin
  select group_id into _gid from public.group_payment_accounts where id = _account_id;
  if _gid is null or _uid is null or not public.is_finance_admin(_uid, _gid) then
    raise exception 'Só o Diretor ou o Tesoureiro gerem as contas do grupo.' using errcode = '42501';
  end if;
  update public.group_payment_accounts set active = _active where id = _account_id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_gid, _uid, case when _active then 'conta_pagamento_ativada' else 'conta_pagamento_desativada' end,
          'group_payment_account', _account_id, '{}'::jsonb);
end; $$;

-- ===================== Funções: depósitos =====================
create or replace function public.submit_deposit(
  _group_id uuid, _for_collective boolean, _amount numeric, _deposit_date date,
  _channel public.payment_channel, _payment_account_id uuid, _transaction_ref text,
  _receipt_path text, _notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _me public.group_members%rowtype; _acc public.group_payment_accounts%rowtype; _id uuid;
begin
  select * into _me from public.group_members where user_id = _uid and group_id = _group_id and status = 'ativo';
  if _uid is null or _me.id is null then
    raise exception 'Só membros ativos do grupo podem submeter depósitos.' using errcode = '42501';
  end if;
  if _for_collective and _me.collective_profile_id is null then
    raise exception 'Não pertence a nenhum perfil coletivo neste grupo.' using errcode = '22023';
  end if;
  if _amount is null or _amount <= 0 or _amount > 100000000 or _amount <> round(_amount, 2) then
    raise exception 'Indique um valor válido em MZN (até 2 casas decimais).' using errcode = '22023';
  end if;
  if _deposit_date is null or _deposit_date > current_date then
    raise exception 'A data do depósito não pode ser no futuro.' using errcode = '22023';
  end if;
  perform public._req(_transaction_ref, 'A referência da transação');
  perform public._req(_receipt_path, 'O comprovativo');
  if _payment_account_id is not null then
    select * into _acc from public.group_payment_accounts where id = _payment_account_id;
    if _acc.id is null or _acc.group_id <> _group_id or not _acc.active or _acc.channel <> _channel then
      raise exception 'A conta escolhida não é válida para este canal.' using errcode = '22023';
    end if;
  end if;
  if split_part(_receipt_path, '/', 1) <> _group_id::text or split_part(_receipt_path, '/', 2) <> _uid::text
     or not exists (select 1 from storage.objects where bucket_id = 'comprovativos' and name = _receipt_path) then
    raise exception 'Comprovativo não encontrado. Volte a anexar o ficheiro.' using errcode = '22023';
  end if;
  if exists (select 1 from public.deposits where receipt_path = _receipt_path) then
    raise exception 'Este comprovativo já foi usado noutro depósito.' using errcode = '23505';
  end if;
  if exists (select 1 from public.deposits where group_id = _group_id and channel = _channel
             and lower(btrim(transaction_ref)) = lower(btrim(_transaction_ref)) and status <> 'rejeitado') then
    raise exception 'Já existe um depósito com esta referência neste canal.' using errcode = '23505';
  end if;
  insert into public.deposits(group_id, member_id, collective_profile_id, submitted_by, submitted_by_member, amount,
                              deposit_date, channel, payment_account_id, transaction_ref, receipt_path, notes)
  values (_group_id, case when _for_collective then null else _me.id end,
          case when _for_collective then _me.collective_profile_id end,
          _uid, _me.id, _amount, _deposit_date, _channel, _payment_account_id, btrim(_transaction_ref), _receipt_path,
          nullif(btrim(coalesce(_notes, '')), ''))
  returning id into _id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'deposito_submetido', 'deposit', _id,
          jsonb_build_object('valor', _amount, 'canal', _channel, 'estado_novo', 'pendente', 'coletivo', _for_collective,
                             'comprovativo', _receipt_path));
  return _id;
end; $$;

-- Quem decide não pode ser o beneficiário, salvo se for o único Diretor/Tesoureiro ativo.
create or replace function public._check_not_self_finance(_d public.deposits, _uid uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare _self boolean; _others int;
begin
  _self := (_d.member_id is not null and public.is_own_member(_uid, _d.member_id))
        or (_d.collective_profile_id is not null and exists (
              select 1 from public.group_members where user_id = _uid and collective_profile_id = _d.collective_profile_id))
        or _d.submitted_by = _uid;
  if not _self then return; end if;
  select count(distinct gm.id) into _others from public.group_members gm
  join public.group_member_roles r on r.member_id = gm.id
  where gm.group_id = _d.group_id and gm.status = 'ativo' and r.role in ('diretor','tesoureiro')
    and gm.user_id is distinct from _uid;
  if _others > 0 then
    raise exception 'Não pode decidir sobre um depósito seu; outro Diretor ou Tesoureiro deve fazê-lo.' using errcode = '42501';
  end if;
end; $$;

create or replace function public.review_deposit(_deposit_id uuid, _approve boolean, _reason text default null)
returns public.deposit_status language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _d public.deposits%rowtype; _me uuid; _new public.deposit_status;
begin
  select * into _d from public.deposits where id = _deposit_id for update;
  if _d.id is null or _uid is null or not public.is_finance_admin(_uid, _d.group_id) then
    raise exception 'Só o Diretor ou o Tesoureiro validam depósitos.' using errcode = '42501';
  end if;
  if _d.status <> 'pendente' then
    raise exception 'Este depósito já foi decidido.' using errcode = '22023';
  end if;
  perform public._check_not_self_finance(_d, _uid);
  if not _approve then perform public._req(_reason, 'O motivo da rejeição'); end if;
  _me := public._active_member_id(_uid, _d.group_id);
  _new := case when _approve then 'aprovado'::public.deposit_status else 'rejeitado'::public.deposit_status end;
  update public.deposits set status = _new, reviewed_by = _uid, reviewed_by_member = _me, reviewed_at = now(),
         rejection_reason = case when _approve then null else btrim(_reason) end
   where id = _d.id;
  if _approve then
    insert into public.savings_ledger(group_id, member_id, collective_profile_id, kind, amount, deposit_id, created_by)
    values (_d.group_id, _d.member_id, _d.collective_profile_id, 'deposito', _d.amount, _d.id, _uid);
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_d.group_id, _uid, case when _approve then 'deposito_aprovado' else 'deposito_rejeitado' end, 'deposit', _d.id,
          jsonb_build_object('valor', _d.amount, 'estado_anterior', 'pendente', 'estado_novo', _new,
                             'motivo', case when _approve then null else btrim(_reason) end, 'comprovativo', _d.receipt_path));
  return _new;
end; $$;

create or replace function public.reverse_deposit(_deposit_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _d public.deposits%rowtype; _e public.savings_ledger%rowtype; _id uuid;
begin
  select * into _d from public.deposits where id = _deposit_id;
  if _d.id is null or _uid is null or not public.is_finance_admin(_uid, _d.group_id) then
    raise exception 'Só o Diretor ou o Tesoureiro fazem estornos.' using errcode = '42501';
  end if;
  select * into _e from public.savings_ledger where deposit_id = _d.id and kind = 'deposito' for update;
  if _d.status <> 'aprovado' or _e.id is null then
    raise exception 'Só depósitos aprovados podem ser estornados.' using errcode = '22023';
  end if;
  if exists (select 1 from public.savings_ledger where reverses_entry_id = _e.id) then
    raise exception 'Este depósito já foi estornado.' using errcode = '23505';
  end if;
  perform public._check_not_self_finance(_d, _uid);
  perform public._req(_reason, 'O motivo do estorno');
  insert into public.savings_ledger(group_id, member_id, collective_profile_id, kind, amount, deposit_id, reverses_entry_id, reason, created_by)
  values (_d.group_id, _d.member_id, _d.collective_profile_id, 'estorno', -_e.amount, _d.id, _e.id, btrim(_reason), _uid)
  returning id into _id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_d.group_id, _uid, 'deposito_estornado', 'deposit', _d.id,
          jsonb_build_object('valor', -_e.amount, 'motivo', btrim(_reason), 'movimento_original', _e.id));
  return _id;
end; $$;

-- ===================== Saldos =====================
create or replace function public.my_savings(_group_id uuid)
returns table (scope text, target_id uuid, label text, confirmed numeric, pending numeric)
language sql stable security definer set search_path = public as $$
  with me as (
    select gm.id, gm.full_name, gm.collective_profile_id from public.group_members gm
    where gm.user_id = auth.uid() and gm.group_id = _group_id and gm.status = 'ativo'
  )
  select 'individual', me.id, me.full_name,
         coalesce((select sum(amount) from public.savings_ledger where member_id = me.id), 0)::numeric(14,2),
         coalesce((select sum(amount) from public.deposits where member_id = me.id and status = 'pendente'), 0)::numeric(14,2)
  from me
  union all
  select 'coletivo', cp.id, cp.name,
         coalesce((select sum(amount) from public.savings_ledger where collective_profile_id = cp.id), 0)::numeric(14,2),
         coalesce((select sum(amount) from public.deposits where collective_profile_id = cp.id and status = 'pendente'), 0)::numeric(14,2)
  from me join public.collective_profiles cp on cp.id = me.collective_profile_id
$$;

create or replace function public.group_savings(_group_id uuid)
returns table (scope text, target_id uuid, label text, confirmed numeric, pending numeric)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'individual'::text, gm.id, gm.full_name,
           coalesce((select sum(amount) from public.savings_ledger where member_id = gm.id), 0)::numeric(14,2),
           coalesce((select sum(amount) from public.deposits where member_id = gm.id and status = 'pendente'), 0)::numeric(14,2)
    from public.group_members gm
    where gm.group_id = _group_id
      and (gm.status = 'ativo' or exists (select 1 from public.savings_ledger l where l.member_id = gm.id))
    union all
    select 'coletivo', cp.id, cp.name,
           coalesce((select sum(amount) from public.savings_ledger where collective_profile_id = cp.id), 0)::numeric(14,2),
           coalesce((select sum(amount) from public.deposits where collective_profile_id = cp.id and status = 'pendente'), 0)::numeric(14,2)
    from public.collective_profiles cp where cp.group_id = _group_id
  ) s
  where public.is_finance_admin(auth.uid(), _group_id)
  order by 3
$$;

-- ===================== Limpeza de grupos de teste (só service role) =====================
create or replace function public.purge_test_group_finance(_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.member_private_data where group_id = _group_id and email not like '%@exemplo.test') then
    raise exception 'Só grupos de teste podem ser limpos.' using errcode = '42501';
  end if;
  perform set_config('smartpoupa.purge', 'on', true);
  delete from public.savings_ledger where group_id = _group_id and reverses_entry_id is not null;
  delete from public.savings_ledger where group_id = _group_id;
  delete from public.deposits where group_id = _group_id;
  delete from public.group_payment_accounts where group_id = _group_id;
end; $$;

-- ===================== Comprovativos (armazenamento privado) =====================
create policy "comprovativos_insert_own" on storage.objects for insert to authenticated with check (
  bucket_id = 'comprovativos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.is_active_member(auth.uid(), public._try_uuid((storage.foldername(name))[1]))
);
create policy "comprovativos_select" on storage.objects for select to authenticated using (
  bucket_id = 'comprovativos'
  and ((storage.foldername(name))[2] = auth.uid()::text
       or public.is_finance_admin(auth.uid(), public._try_uuid((storage.foldername(name))[1])))
);

-- ===================== Permissões de execução =====================
revoke execute on function public._try_uuid(text) from public, anon;
grant execute on function public._try_uuid(text) to authenticated;
revoke execute on function public.is_finance_admin(uuid, uuid) from public, anon;
grant execute on function public.is_finance_admin(uuid, uuid) to authenticated;
revoke execute on function public._purge_allowed() from public, anon, authenticated;
revoke execute on function public._guard_ledger() from public, anon, authenticated;
revoke execute on function public._guard_deposit() from public, anon, authenticated;
revoke execute on function public._guard_payment_account() from public, anon, authenticated;
revoke execute on function public._check_not_self_finance(public.deposits, uuid) from public, anon, authenticated;
revoke execute on function public.purge_test_group_finance(uuid) from public, anon, authenticated;
grant execute on function public.purge_test_group_finance(uuid) to service_role;
revoke execute on function public.create_payment_account(uuid, public.payment_channel, text, text, text) from public, anon;
revoke execute on function public.set_payment_account_active(uuid, boolean) from public, anon;
revoke execute on function public.submit_deposit(uuid, boolean, numeric, date, public.payment_channel, uuid, text, text, text) from public, anon;
revoke execute on function public.review_deposit(uuid, boolean, text) from public, anon;
revoke execute on function public.reverse_deposit(uuid, text) from public, anon;
revoke execute on function public.my_savings(uuid) from public, anon;
revoke execute on function public.group_savings(uuid) from public, anon;
grant execute on function public.create_payment_account(uuid, public.payment_channel, text, text, text) to authenticated;
grant execute on function public.set_payment_account_active(uuid, boolean) to authenticated;
grant execute on function public.submit_deposit(uuid, boolean, numeric, date, public.payment_channel, uuid, text, text, text) to authenticated;
grant execute on function public.review_deposit(uuid, boolean, text) to authenticated;
grant execute on function public.reverse_deposit(uuid, text) to authenticated;
grant execute on function public.my_savings(uuid) to authenticated;
grant execute on function public.group_savings(uuid) to authenticated;