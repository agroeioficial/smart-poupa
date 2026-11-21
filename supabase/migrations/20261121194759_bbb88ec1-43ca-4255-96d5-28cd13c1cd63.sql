-- ===================== Convidados e pendentes veem o nome do grupo =====================
create or replace function public.has_pending_invite(_uid uuid, _group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members
                 where user_id = _uid and group_id = _group and status in ('convidado','pendente_aprovacao'))
$$;

-- ===================== Avisos do grupo =====================
create table public.group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  kind text not null check (kind in ('membro_admitido')),
  member_id uuid references public.group_members(id) on delete set null,
  member_name text not null,
  created_at timestamptz not null default now()
);
create index group_events_group_idx on public.group_events(group_id, created_at desc);
create index group_events_member_idx on public.group_events(member_id);
grant select on public.group_events to authenticated;
grant all on public.group_events to service_role;
alter table public.group_events enable row level security;
create policy "group_events_select" on public.group_events for select to authenticated using (
  public.is_active_member(auth.uid(), group_id)
);

-- ===================== Pedidos: novo tipo "admissao" =====================
alter table public.member_status_requests drop constraint if exists member_status_requests_kind_check;
alter table public.member_status_requests drop constraint if exists member_status_requests_kind_fields;
alter table public.member_status_requests add constraint member_status_requests_kind_check
  check (kind in ('estado','papeis','admissao'));
alter table public.member_status_requests add constraint member_status_requests_kind_fields check (
  (kind = 'estado' and requested_status is not null and from_status is not null)
  or (kind in ('papeis','admissao') and requested_roles is not null and cardinality(requested_roles) > 0)
);

create or replace function public._status_request_state(_request_id uuid)
returns public.request_status language plpgsql stable security definer set search_path = public as $$
declare _r public.member_status_requests%rowtype; _eligible uuid[]; _n int; _need int; _approvals int; _role public.group_role;
begin
  select * into _r from public.member_status_requests where id = _request_id;
  if _r.status <> 'pendente' then return _r.status; end if;
  if exists (select 1 from public.member_status_request_votes where request_id = _r.id and vote = 'rejeitado') then
    return 'rejeitado';
  end if;
  select coalesce(array_agg(distinct gm.id), '{}') into _eligible
  from public.group_members gm
  join public.group_member_roles gr on gr.member_id = gm.id
  where gm.group_id = _r.group_id and gm.status = 'ativo' and gm.id <> _r.member_id
    and gr.role in ('diretor','tesoureiro','secretario');
  _n := cardinality(_eligible);
  if _n = 0 then return 'pendente'; end if;
  select count(*) into _approvals from public.member_status_request_votes v
   where v.request_id = _r.id and v.vote = 'aprovado' and v.voter_member_id = any(_eligible);
  -- Admissão: aprovação unânime de toda a direção ativa
  if _r.kind = 'admissao' then
    return case when _approvals >= _n then 'aprovado'::public.request_status else 'pendente'::public.request_status end;
  end if;
  _need := least(_n, 3);
  if _approvals < _need then return 'pendente'; end if;
  if _n >= 3 then
    foreach _role in array array['diretor','tesoureiro','secretario']::public.group_role[] loop
      if exists (select 1 from public.group_member_roles gr where gr.member_id = any(_eligible) and gr.role = _role)
         and not exists (
           select 1 from public.member_status_request_votes v
           join public.group_member_roles gr on gr.member_id = v.voter_member_id and gr.role = _role
           where v.request_id = _r.id and v.vote = 'aprovado' and v.voter_member_id = any(_eligible)) then
        return 'pendente';
      end if;
    end loop;
  end if;
  return 'aprovado';
end; $$;

create or replace function public._set_roles_logged(_m public.group_members, _roles public.group_role[], _by uuid, _label text)
returns public.group_role[] language plpgsql security definer set search_path = public as $$
declare _before public.group_role[];
begin
  select coalesce(array_agg(role), '{}') into _before from public.group_member_roles where member_id = _m.id;
  delete from public.group_member_roles where member_id = _m.id and not (role = any(_roles));
  insert into public.group_member_roles(group_id, member_id, role, created_by)
  select _m.group_id, _m.id, r, _by from (select distinct unnest(_roles) as r) s
  on conflict (member_id, role) do nothing;
  perform public._log_admin_roles(_m.id, array(select r from unnest(_roles) r where not (r = any(_before))), 'atribuido', null, _label);
  perform public._log_admin_roles(_m.id, array(select r from unnest(_before) r where not (r = any(_roles))), 'removido', null, _label);
  return _before;
end; $$;

create or replace function public._apply_status_request(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _r public.member_status_requests%rowtype; _m public.group_members%rowtype;
        _admin_roles public.group_role[]; _before public.group_role[];
begin
  select * into _r from public.member_status_requests where id = _request_id for update;
  select * into _m from public.group_members where id = _r.member_id for update;

  if _r.kind = 'admissao' then
    if _m.status not in ('convidado','pendente_aprovacao') then
      raise exception 'Este membro já não está a aguardar admissão.' using errcode = '22023';
    end if;
    perform public._set_roles_logged(_m, _r.requested_roles, _r.requested_by, 'Admissão aprovada pela direção');
    update public.member_status_requests set status = 'aprovado', resolved_at = now() where id = _r.id;
    if _m.status = 'pendente_aprovacao' then
      update public.group_members set status = 'ativo', joined_at = now() where id = _m.id;
      insert into public.group_events(group_id, kind, member_id, member_name)
      values (_m.group_id, 'membro_admitido', _m.id, _m.full_name);
    end if;
    insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
    values (_m.group_id, null, 'admissao_aprovada', 'group_member', _m.id, jsonb_build_object('pedido', _r.id));
    return;
  end if;

  if _r.kind = 'papeis' then
    perform public._validate_roles_change(_m, _r.requested_roles);
    _before := public._set_roles_logged(_m, _r.requested_roles, _r.requested_by, 'Aprovação da direção');
    update public.member_status_requests set status = 'aprovado', resolved_at = now() where id = _r.id;
    insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
    values (_m.group_id, null, 'papeis_alterados', 'group_member', _m.id,
            jsonb_build_object('anteriores', to_jsonb(_before), 'novos', to_jsonb(_r.requested_roles), 'pedido', _r.id));
    return;
  end if;

  perform public._validate_status_change(_m, _r.requested_status);
  update public.group_members set status = _r.requested_status where id = _m.id;
  update public.member_status_requests set status = 'aprovado', resolved_at = now() where id = _r.id;
  select coalesce(array_agg(role), '{}') into _admin_roles from public.group_member_roles
   where member_id = _m.id and role in ('diretor','tesoureiro','secretario');
  if cardinality(_admin_roles) > 0 then
    perform public._log_admin_roles(_m.id, _admin_roles,
      case _r.requested_status when 'suspenso' then 'suspenso' when 'excluido' then 'excluido' else 'reativado' end,
      null, 'Aprovação da direção');
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_m.group_id, null, 'estado_alterado', 'group_member', _m.id,
          jsonb_build_object('anterior', _m.status, 'novo', _r.requested_status, 'pedido', _r.id));
end; $$;

create or replace function public._open_board_request(
  _m public.group_members, _uid uuid, _kind text, _status public.member_status,
  _roles public.group_role[], _reason text)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare _me uuid; _rid uuid; _state public.request_status; _cur public.group_role[];
begin
  _me := public._active_member_id(_uid, _m.group_id);
  if _me is null then
    raise exception 'Apenas a direção do grupo pode fazer pedidos.' using errcode = '42501';
  end if;
  if exists (select 1 from public.member_status_requests where member_id = _m.id and status = 'pendente') then
    raise exception 'Já existe um pedido pendente para este membro.' using errcode = '23505';
  end if;
  select coalesce(array_agg(role), '{}') into _cur from public.group_member_roles where member_id = _m.id;
  insert into public.member_status_requests(group_id, member_id, kind, from_status, requested_status,
                                            from_roles, requested_roles, reason, requested_by, requested_by_member)
  values (_m.group_id, _m.id, _kind,
          case when _kind = 'estado' then _m.status end, _status,
          _cur, case when _kind in ('papeis','admissao') then (select array_agg(distinct r) from unnest(_roles) r) end,
          btrim(_reason), _uid, _me)
  returning id into _rid;
  insert into public.member_status_request_votes(request_id, group_id, voter_member_id, voter_user_id, vote)
  values (_rid, _m.group_id, _me, _uid, 'aprovado');
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_m.group_id, _uid, 'pedido_criado', 'member_status_request', _rid,
          jsonb_build_object('membro', _m.id, 'tipo', _kind));
  _state := public._status_request_state(_rid);
  if _state = 'aprovado' then
    perform public._apply_status_request(_rid);
  end if;
  return _state;
end; $$;

create or replace function public.vote_member_status_request(_request_id uuid, _approve boolean, _reason text default null)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _r public.member_status_requests%rowtype; _me uuid; _state public.request_status;
begin
  select * into _r from public.member_status_requests where id = _request_id for update;
  if _r.id is null or _uid is null or not public.is_group_admin(_uid, _r.group_id) then
    raise exception 'Sem permissão para votar neste pedido.' using errcode = '42501';
  end if;
  if _r.status <> 'pendente' then
    raise exception 'Este pedido já foi decidido.' using errcode = '22023';
  end if;
  _me := public._active_member_id(_uid, _r.group_id);
  if _me = _r.member_id then
    raise exception 'Não pode votar num pedido sobre si próprio.' using errcode = '42501';
  end if;
  if exists (select 1 from public.member_status_request_votes where request_id = _r.id and voter_member_id = _me) then
    raise exception 'Já votou neste pedido.' using errcode = '23505';
  end if;
  if not _approve then
    perform public._req(_reason, 'O motivo da rejeição');
  end if;
  insert into public.member_status_request_votes(request_id, group_id, voter_member_id, voter_user_id, vote, reason)
  values (_r.id, _r.group_id, _me, _uid, case when _approve then 'aprovado'::public.vote_choice else 'rejeitado'::public.vote_choice end,
          nullif(btrim(coalesce(_reason, '')), ''));
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_r.group_id, _uid, case when _approve then 'pedido_estado_aprovado' else 'pedido_estado_rejeitado' end,
          'member_status_request', _r.id, '{}'::jsonb);
  _state := public._status_request_state(_r.id);
  if _state = 'aprovado' then
    perform public._apply_status_request(_r.id);
  elsif _state = 'rejeitado' then
    update public.member_status_requests set status = 'rejeitado', resolved_at = now() where id = _r.id;
    if _r.kind = 'admissao' then
      -- Rejeição da admissão: exclusão definitiva (o registo fica guardado)
      update public.group_members set status = 'excluido' where id = _r.member_id;
      insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
      values (_r.group_id, _uid, 'admissao_rejeitada', 'group_member', _r.member_id, jsonb_build_object('pedido', _r.id));
    end if;
  end if;
  return _state;
end; $$;

create or replace function public.cancel_member_status_request(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid; _kind text;
begin
  select kind into _kind from public.member_status_requests where id = _request_id;
  if _kind = 'admissao' then
    raise exception 'Pedidos de admissão não podem ser cancelados; a direção aprova ou rejeita.' using errcode = '22023';
  end if;
  update public.member_status_requests set status = 'cancelado', resolved_at = now()
   where id = _request_id and requested_by = _uid and status = 'pendente'
  returning group_id into _gid;
  if _gid is null then
    raise exception 'Só quem fez o pedido o pode cancelar enquanto estiver pendente.' using errcode = '42501';
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_gid, _uid, 'pedido_estado_cancelado', 'member_status_request', _request_id);
end; $$;

-- Cadastro abre sempre o pedido de admissão (com os cargos indicados)
create or replace function public.add_group_member(
  _group_id uuid, _full_name text, _email text, _phone text, _profession text,
  _roles public.group_role[] default array['membro']::public.group_role[],
  _id_document_type text default null, _id_document_number text default null,
  _birth_date date default null, _address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _mid uuid; _linked uuid; _m public.group_members%rowtype;
begin
  if _uid is null or not public.can_manage_members(_uid, _group_id) then
    raise exception 'Sem permissão para cadastrar membros neste grupo.' using errcode = '42501';
  end if;
  if _roles is null or cardinality(_roles) = 0 then
    raise exception 'Indique pelo menos um papel.' using errcode = '22023';
  end if;
  if not public._valid_email(_email) then
    raise exception 'O email é obrigatório e deve ser válido.' using errcode = '22023';
  end if;
  perform public._check_member_fields(_full_name, _phone, _profession, _id_document_type,
                                      _id_document_number, _birth_date, _address);
  if exists (select 1 from public.member_private_data
             where group_id = _group_id and lower(email) = lower(btrim(_email))) then
    raise exception 'Já existe um membro com este email neste grupo.' using errcode = '23505';
  end if;
  _linked := public._confirmed_user_id(_email);
  if _linked is not null and exists (select 1 from public.group_members where group_id = _group_id and user_id = _linked) then
    raise exception 'Esta pessoa já pertence ao grupo.' using errcode = '23505';
  end if;
  insert into public.group_members(group_id, user_id, full_name, phone, profession, status, created_by)
  values (_group_id, _linked, btrim(_full_name), btrim(_phone), btrim(_profession), 'convidado', _uid)
  returning id into _mid;
  insert into public.member_private_data(member_id, group_id, email, id_document_type, id_document_number, birth_date, address)
  values (_mid, _group_id, lower(btrim(_email)), btrim(_id_document_type), btrim(_id_document_number),
          _birth_date, btrim(_address));
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'membro_cadastrado', 'group_member', _mid, jsonb_build_object('papeis', to_jsonb(_roles)));
  select * into _m from public.group_members where id = _mid;
  perform public._open_board_request(_m, _uid, 'admissao', null, _roles, 'Admissão de novo membro');
  return _mid;
end; $$;

-- Aceitar convite: fica à espera se a admissão ainda não foi aprovada por todos
create or replace function public.accept_invitation(_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.group_members%rowtype;
begin
  select * into _m from public.group_members where id = _member_id and user_id = _uid and status = 'convidado' for update;
  if _m.id is null then
    raise exception 'Convite não encontrado.' using errcode = '22023';
  end if;
  if exists (select 1 from public.member_status_requests where member_id = _m.id and kind = 'admissao' and status = 'pendente') then
    update public.group_members set status = 'pendente_aprovacao' where id = _m.id;
  else
    update public.group_members set status = 'ativo', joined_at = now() where id = _m.id;
    if exists (select 1 from public.member_status_requests where member_id = _m.id and kind = 'admissao' and status = 'aprovado') then
      insert into public.group_events(group_id, kind, member_id, member_name)
      values (_m.group_id, 'membro_admitido', _m.id, _m.full_name);
    end if;
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_m.group_id, _uid, 'convite_aceite', 'group_member', _m.id);
end; $$;

-- ===================== Beneficiário por morte =====================
create table public.member_beneficiaries (
  member_id uuid primary key references public.group_members(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  full_name text not null,
  relationship text not null,
  phone text not null,
  document_type text not null check (document_type in ('bi','cedula','cartao_eleitor','carta_conducao','passaporte')),
  document_number text not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index member_beneficiaries_group_idx on public.member_beneficiaries(group_id);
grant select on public.member_beneficiaries to authenticated;
grant all on public.member_beneficiaries to service_role;
alter table public.member_beneficiaries enable row level security;
create policy "member_beneficiaries_select" on public.member_beneficiaries for select to authenticated using (
  public.is_own_member(auth.uid(), member_id) or public.is_group_admin(auth.uid(), group_id)
);
create trigger member_beneficiaries_updated_at before update on public.member_beneficiaries
for each row execute function public.set_updated_at();

create table public.member_beneficiary_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.group_members(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  full_name text not null,
  relationship text not null,
  phone text not null,
  document_type text not null,
  document_number text not null,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index member_beneficiary_history_member_idx on public.member_beneficiary_history(member_id, created_at desc);
create index member_beneficiary_history_group_idx on public.member_beneficiary_history(group_id);
grant select on public.member_beneficiary_history to authenticated;
grant all on public.member_beneficiary_history to service_role;
alter table public.member_beneficiary_history enable row level security;
create policy "member_beneficiary_history_select" on public.member_beneficiary_history for select to authenticated using (
  public.is_own_member(auth.uid(), member_id) or public.is_group_admin(auth.uid(), group_id)
);

create or replace function public.set_my_beneficiary(
  _member_id uuid, _full_name text, _relationship text, _phone text, _document_type text, _document_number text)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.group_members%rowtype;
begin
  select * into _m from public.group_members where id = _member_id;
  if _m.id is null or _uid is null or _m.user_id is distinct from _uid or _m.status <> 'ativo' then
    raise exception 'Só o próprio membro ativo pode indicar o seu beneficiário.' using errcode = '42501';
  end if;
  perform public._req(_full_name, 'O nome do beneficiário');
  perform public._req(_relationship, 'A relação ou parentesco');
  perform public._req(_phone, 'O contacto do beneficiário');
  perform public._req(_document_number, 'O número do documento');
  if _document_type is null or _document_type not in ('bi','cedula','cartao_eleitor','carta_conducao','passaporte') then
    raise exception 'Tipo de documento inválido.' using errcode = '22023';
  end if;
  if char_length(_full_name) > 120 or char_length(_relationship) > 60 or char_length(_phone) > 30 or char_length(_document_number) > 40 then
    raise exception 'Dados demasiado longos.' using errcode = '22023';
  end if;
  insert into public.member_beneficiaries(member_id, group_id, full_name, relationship, phone, document_type, document_number, updated_by)
  values (_m.id, _m.group_id, btrim(_full_name), btrim(_relationship), btrim(_phone), _document_type, btrim(_document_number), _uid)
  on conflict (member_id) do update set
    full_name = excluded.full_name, relationship = excluded.relationship, phone = excluded.phone,
    document_type = excluded.document_type, document_number = excluded.document_number, updated_by = _uid;
  insert into public.member_beneficiary_history(member_id, group_id, full_name, relationship, phone, document_type, document_number, changed_by)
  values (_m.id, _m.group_id, btrim(_full_name), btrim(_relationship), btrim(_phone), _document_type, btrim(_document_number), _uid);
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_m.group_id, _uid, 'beneficiario_atualizado', 'group_member', _m.id);
end; $$;

-- ===================== Perfis coletivos =====================
create table public.collective_profiles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  relation_type text not null check (relation_type in ('familia','amigos','colegas','outro')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index collective_profiles_group_name_idx on public.collective_profiles(group_id, lower(name));
create trigger collective_profiles_updated_at before update on public.collective_profiles
for each row execute function public.set_updated_at();

alter table public.group_members add column collective_profile_id uuid references public.collective_profiles(id) on delete restrict;
create index group_members_collective_idx on public.group_members(collective_profile_id);

create or replace function public._in_collective(_uid uuid, _profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members
                 where user_id = _uid and collective_profile_id = _profile and status = 'ativo')
$$;

grant select on public.collective_profiles to authenticated;
grant all on public.collective_profiles to service_role;
alter table public.collective_profiles enable row level security;
create policy "collective_profiles_select" on public.collective_profiles for select to authenticated using (
  public.is_group_admin(auth.uid(), group_id)
  or (public.is_active_member(auth.uid(), group_id) and public.group_directory_visible(group_id))
  or public._in_collective(auth.uid(), id)
);

-- Integrantes do mesmo perfil coletivo veem-se uns aos outros
drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select" on public.group_members for select to authenticated using (
  user_id = auth.uid()
  or public.is_group_admin(auth.uid(), group_id)
  or (status = 'ativo' and public.is_active_member(auth.uid(), group_id) and public.group_directory_visible(group_id))
  or (status = 'ativo' and collective_profile_id is not null and public._in_collective(auth.uid(), collective_profile_id))
);

create or replace function public.group_collective_profiles(_group_id uuid)
returns table (id uuid, name text, relation_type text, member_count int)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.name, cp.relation_type,
         (select count(*)::int from public.group_members gm where gm.collective_profile_id = cp.id and gm.status = 'ativo')
  from public.collective_profiles cp
  where cp.group_id = _group_id
    and (public.is_group_admin(auth.uid(), _group_id)
         or (public.is_active_member(auth.uid(), _group_id) and public.group_directory_visible(_group_id))
         or public._in_collective(auth.uid(), cp.id))
  order by cp.name
$$;

create or replace function public.create_collective_profile(_group_id uuid, _name text, _relation_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _id uuid;
begin
  if _uid is null or not public.can_manage_members(_uid, _group_id) then
    raise exception 'Sem permissão para criar perfis coletivos neste grupo.' using errcode = '42501';
  end if;
  perform public._req(_name, 'O nome do perfil');
  if _relation_type not in ('familia','amigos','colegas','outro') then
    raise exception 'Tipo de relação inválido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.collective_profiles where group_id = _group_id and lower(name) = lower(btrim(_name))) then
    raise exception 'Já existe um perfil coletivo com este nome.' using errcode = '23505';
  end if;
  insert into public.collective_profiles(group_id, name, relation_type, created_by)
  values (_group_id, btrim(_name), _relation_type, _uid) returning id into _id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'perfil_coletivo_criado', 'collective_profile', _id, jsonb_build_object('nome', btrim(_name)));
  return _id;
end; $$;

create or replace function public.update_collective_profile(_profile_id uuid, _name text, _relation_type text)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid;
begin
  select group_id into _gid from public.collective_profiles where id = _profile_id;
  if _gid is null or _uid is null or not public.can_manage_members(_uid, _gid) then
    raise exception 'Sem permissão para alterar este perfil coletivo.' using errcode = '42501';
  end if;
  perform public._req(_name, 'O nome do perfil');
  if _relation_type not in ('familia','amigos','colegas','outro') then
    raise exception 'Tipo de relação inválido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.collective_profiles where group_id = _gid and lower(name) = lower(btrim(_name)) and id <> _profile_id) then
    raise exception 'Já existe um perfil coletivo com este nome.' using errcode = '23505';
  end if;
  update public.collective_profiles set name = btrim(_name), relation_type = _relation_type where id = _profile_id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_gid, _uid, 'perfil_coletivo_alterado', 'collective_profile', _profile_id);
end; $$;

create or replace function public.set_member_collective_profile(_member_id uuid, _profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.group_members%rowtype; _pg uuid;
begin
  select * into _m from public.group_members where id = _member_id;
  if _m.id is null or _uid is null or not public.can_manage_members(_uid, _m.group_id) then
    raise exception 'Sem permissão para alterar este membro.' using errcode = '42501';
  end if;
  if _m.status = 'excluido' then
    raise exception 'Membro excluído não pode ser associado a um perfil.' using errcode = '22023';
  end if;
  if _profile_id is not null then
    select group_id into _pg from public.collective_profiles where id = _profile_id;
    if _pg is null or _pg <> _m.group_id then
      raise exception 'Perfil coletivo não encontrado neste grupo.' using errcode = '22023';
    end if;
  end if;
  update public.group_members set collective_profile_id = _profile_id where id = _m.id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_m.group_id, _uid, 'perfil_coletivo_membro', 'group_member', _m.id, jsonb_build_object('perfil', _profile_id));
end; $$;

-- ===================== Permissões de execução =====================
revoke execute on function public._set_roles_logged(public.group_members, public.group_role[], uuid, text) from public, anon, authenticated;
revoke execute on function public._in_collective(uuid, uuid) from public, anon;
grant execute on function public._in_collective(uuid, uuid) to authenticated;
revoke execute on function public.set_my_beneficiary(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.group_collective_profiles(uuid) from public, anon;
revoke execute on function public.create_collective_profile(uuid, text, text) from public, anon;
revoke execute on function public.update_collective_profile(uuid, text, text) from public, anon;
revoke execute on function public.set_member_collective_profile(uuid, uuid) from public, anon;
grant execute on function public.set_my_beneficiary(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.group_collective_profiles(uuid) to authenticated;
grant execute on function public.create_collective_profile(uuid, text, text) to authenticated;
grant execute on function public.update_collective_profile(uuid, text, text) to authenticated;
grant execute on function public.set_member_collective_profile(uuid, uuid) to authenticated;