-- ===================== Campos obrigatórios =====================
create or replace function public._req(_v text, _label text)
returns text language plpgsql immutable set search_path = public as $$
begin
  if coalesce(btrim(_v), '') = '' then
    raise exception '% é obrigatório.', _label using errcode = '22023';
  end if;
  return btrim(_v);
end; $$;

create or replace function public._check_member_fields(
  _full_name text, _phone text, _profession text, _doc_type text, _doc_number text, _birth date, _address text)
returns void language plpgsql stable set search_path = public as $$
begin
  perform public._req(_full_name, 'O nome completo');
  perform public._req(_phone, 'O contacto');
  perform public._req(_profession, 'A profissão');
  perform public._req(_doc_type, 'O tipo de documento de identificação');
  perform public._req(_doc_number, 'O número do documento de identificação');
  perform public._req(_address, 'A morada');
  if _birth is null then
    raise exception 'A data de nascimento é obrigatória.' using errcode = '22023';
  end if;
  if _birth > current_date then
    raise exception 'A data de nascimento não pode ser no futuro.' using errcode = '22023';
  end if;
end; $$;

-- ===================== Histórico da direção =====================
create table public.admin_role_history (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  member_id uuid references public.group_members(id) on delete set null,
  member_name text not null,
  role public.group_role not null,
  action text not null check (action in ('atribuido','removido','suspenso','excluido','reativado')),
  actor_id uuid,
  actor_label text not null,
  created_at timestamptz not null default now()
);
create index admin_role_history_group_idx on public.admin_role_history(group_id, created_at desc);
grant select on public.admin_role_history to authenticated;
grant all on public.admin_role_history to service_role;
alter table public.admin_role_history enable row level security;
create policy "admin_role_history_select" on public.admin_role_history for select to authenticated using (
  public.is_active_member(auth.uid(), group_id)
);

create or replace function public._member_label(_uid uuid, _group uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select full_name from public.group_members where user_id = _uid and group_id = _group limit 1),
    case when public.is_platform_owner(_uid) then 'AGROEI' else 'Sistema' end)
$$;

create or replace function public._log_admin_roles(
  _member_id uuid, _roles public.group_role[], _action text, _actor uuid, _actor_label text)
returns void language plpgsql security definer set search_path = public as $$
declare _m public.group_members%rowtype;
begin
  select * into _m from public.group_members where id = _member_id;
  insert into public.admin_role_history(group_id, member_id, member_name, role, action, actor_id, actor_label)
  select _m.group_id, _m.id, _m.full_name, r, _action, _actor, _actor_label
  from (select distinct unnest(_roles) as r) s
  where r in ('diretor','tesoureiro','secretario');
end; $$;

-- Histórico inicial a partir dos cargos já existentes
insert into public.admin_role_history(group_id, member_id, member_name, role, action, actor_id, actor_label, created_at)
select r.group_id, gm.id, gm.full_name, r.role, 'atribuido', r.created_by,
       public._member_label(r.created_by, r.group_id), r.created_at
from public.group_member_roles r join public.group_members gm on gm.id = r.member_id
where r.role in ('diretor','tesoureiro','secretario');

-- Direção atual (nomes e cargos), visível a todos os membros ativos do grupo
create or replace function public.group_board(_group_id uuid)
returns table (member_id uuid, full_name text, roles public.group_role[])
language sql stable security definer set search_path = public as $$
  select gm.id, gm.full_name, array_agg(r.role order by r.role)
  from public.group_members gm
  join public.group_member_roles r on r.member_id = gm.id
  where gm.group_id = _group_id and gm.status = 'ativo'
    and r.role in ('diretor','tesoureiro','secretario')
    and public.is_active_member(auth.uid(), _group_id)
  group by gm.id, gm.full_name
  order by gm.full_name
$$;

-- ===================== Operações atualizadas =====================
create or replace function public.create_group(
  _name text, _location text, _official_phone text, _official_email text,
  _director_name text, _director_email text, _director_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid; _mid uuid;
begin
  if _uid is null or not public.is_platform_owner(_uid) then
    raise exception 'Apenas a AGROEI pode criar grupos.' using errcode = '42501';
  end if;
  if not public._valid_email(_director_email) then
    raise exception 'Email do Diretor inválido.' using errcode = '22023';
  end if;
  insert into public.groups(name, location, official_phone, official_email, created_by)
  values (btrim(_name), nullif(btrim(_location), ''), nullif(btrim(_official_phone), ''),
          nullif(lower(btrim(_official_email)), ''), _uid)
  returning id into _gid;
  insert into public.group_members(group_id, user_id, full_name, phone, status, created_by)
  values (_gid, public._confirmed_user_id(_director_email), btrim(_director_name),
          nullif(btrim(_director_phone), ''), 'convidado', _uid)
  returning id into _mid;
  insert into public.member_private_data(member_id, group_id, email)
  values (_mid, _gid, lower(btrim(_director_email)));
  insert into public.group_member_roles(group_id, member_id, role, created_by)
  values (_gid, _mid, 'diretor', _uid);
  perform public._log_admin_roles(_mid, array['diretor']::public.group_role[], 'atribuido', _uid, 'AGROEI');
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_gid, _uid, 'grupo_criado', 'group', _gid, jsonb_build_object('nome', btrim(_name)));
  return _gid;
end; $$;

create or replace function public.add_group_member(
  _group_id uuid, _full_name text, _email text, _phone text, _profession text,
  _roles public.group_role[] default array['membro']::public.group_role[],
  _id_document_type text default null, _id_document_number text default null,
  _birth_date date default null, _address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _mid uuid; _linked uuid;
begin
  if _uid is null or not public.can_manage_members(_uid, _group_id) then
    raise exception 'Sem permissão para cadastrar membros neste grupo.' using errcode = '42501';
  end if;
  if _roles is null or cardinality(_roles) = 0 then
    raise exception 'Indique pelo menos um papel.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(_roles) r where r <> 'membro')
     and not public.has_group_role(_uid, _group_id, 'diretor') then
    raise exception 'Apenas o Diretor pode atribuir papéis administrativos.' using errcode = '42501';
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
  insert into public.group_member_roles(group_id, member_id, role, created_by)
  select _group_id, _mid, r, _uid from (select distinct unnest(_roles) as r) s;
  perform public._log_admin_roles(_mid, _roles, 'atribuido', _uid, public._member_label(_uid, _group_id));
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'membro_cadastrado', 'group_member', _mid, jsonb_build_object('papeis', to_jsonb(_roles)));
  return _mid;
end; $$;

create or replace function public.update_group_member(
  _member_id uuid, _full_name text, _phone text, _profession text,
  _id_document_type text, _id_document_number text, _birth_date date, _address text)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid;
begin
  select group_id into _gid from public.group_members where id = _member_id;
  if _gid is null or _uid is null or not public.can_manage_members(_uid, _gid) then
    raise exception 'Sem permissão para editar este membro.' using errcode = '42501';
  end if;
  perform public._check_member_fields(_full_name, _phone, _profession, _id_document_type,
                                      _id_document_number, _birth_date, _address);
  update public.group_members
     set full_name = btrim(_full_name), phone = btrim(_phone), profession = btrim(_profession)
   where id = _member_id;
  update public.member_private_data
     set id_document_type = btrim(_id_document_type), id_document_number = btrim(_id_document_number),
         birth_date = _birth_date, address = btrim(_address)
   where member_id = _member_id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_gid, _uid, 'membro_editado', 'group_member', _member_id);
end; $$;

create or replace function public.set_member_roles(_member_id uuid, _roles public.group_role[])
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid; _before public.group_role[]; _directors int; _label text;
begin
  select group_id into _gid from public.group_members where id = _member_id;
  if _gid is null or _uid is null or not public.has_group_role(_uid, _gid, 'diretor') then
    raise exception 'Apenas o Diretor pode atribuir papéis.' using errcode = '42501';
  end if;
  if _roles is null or cardinality(_roles) = 0 then
    raise exception 'Indique pelo menos um papel.' using errcode = '22023';
  end if;
  if not ('diretor' = any(_roles)) then
    select count(*) into _directors from public.group_member_roles r join public.group_members gm on gm.id = r.member_id
     where r.group_id = _gid and r.role = 'diretor' and gm.status = 'ativo' and gm.id <> _member_id;
    if _directors = 0 then
      raise exception 'O grupo deve manter pelo menos um Diretor ativo.' using errcode = '22023';
    end if;
  end if;
  select coalesce(array_agg(role), '{}') into _before from public.group_member_roles where member_id = _member_id;
  delete from public.group_member_roles where member_id = _member_id and not (role = any(_roles));
  insert into public.group_member_roles(group_id, member_id, role, created_by)
  select _gid, _member_id, r, _uid from (select distinct unnest(_roles) as r) s
  on conflict (member_id, role) do nothing;
  _label := public._member_label(_uid, _gid);
  perform public._log_admin_roles(_member_id,
    array(select r from unnest(_roles) r where not (r = any(_before))), 'atribuido', _uid, _label);
  perform public._log_admin_roles(_member_id,
    array(select r from unnest(_before) r where not (r = any(_roles))), 'removido', _uid, _label);
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_gid, _uid, 'papeis_alterados', 'group_member', _member_id,
          jsonb_build_object('anteriores', to_jsonb(_before), 'novos', to_jsonb(_roles)));
end; $$;

-- ===================== Pedidos de alteração de estado =====================
create type public.request_status as enum ('pendente','aprovado','rejeitado','cancelado');
create type public.vote_choice as enum ('aprovado','rejeitado');

create table public.member_status_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  member_id uuid not null references public.group_members(id) on delete restrict,
  from_status public.member_status not null,
  requested_status public.member_status not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  requested_by uuid not null,
  requested_by_member uuid not null references public.group_members(id) on delete restrict,
  status public.request_status not null default 'pendente',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index member_status_requests_one_pending on public.member_status_requests(member_id) where status = 'pendente';
create index member_status_requests_group_idx on public.member_status_requests(group_id, status, created_at desc);
grant select on public.member_status_requests to authenticated;
grant all on public.member_status_requests to service_role;
alter table public.member_status_requests enable row level security;
create policy "member_status_requests_select" on public.member_status_requests for select to authenticated using (
  public.is_group_admin(auth.uid(), group_id)
);
create trigger member_status_requests_updated_at before update on public.member_status_requests
for each row execute function public.set_updated_at();

create table public.member_status_request_votes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.member_status_requests(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete restrict,
  voter_member_id uuid not null references public.group_members(id) on delete restrict,
  voter_user_id uuid not null,
  vote public.vote_choice not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (request_id, voter_member_id)
);
create index member_status_request_votes_group_idx on public.member_status_request_votes(group_id);
grant select on public.member_status_request_votes to authenticated;
grant all on public.member_status_request_votes to service_role;
alter table public.member_status_request_votes enable row level security;
create policy "member_status_request_votes_select" on public.member_status_request_votes for select to authenticated using (
  public.is_group_admin(auth.uid(), group_id)
);

create or replace function public._active_member_id(_uid uuid, _group uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.group_members where user_id = _uid and group_id = _group and status = 'ativo' limit 1
$$;

-- Estado de um pedido segundo a regra aprovada pela AGROEI
create or replace function public._status_request_state(_request_id uuid)
returns public.request_status language plpgsql stable security definer set search_path = public as $$
declare _r public.member_status_requests%rowtype; _n int; _need int; _approvals int; _role public.group_role;
begin
  select * into _r from public.member_status_requests where id = _request_id;
  if _r.status <> 'pendente' then return _r.status; end if;
  if exists (select 1 from public.member_status_request_votes where request_id = _r.id and vote = 'rejeitado') then
    return 'rejeitado';
  end if;
  create temporary table if not exists _eligible (member_id uuid primary key) on commit drop;
  delete from _eligible;
  insert into _eligible
  select distinct gm.id from public.group_members gm
  join public.group_member_roles gr on gr.member_id = gm.id
  where gm.group_id = _r.group_id and gm.status = 'ativo' and gm.id <> _r.member_id
    and gr.role in ('diretor','tesoureiro','secretario');
  select count(*) into _n from _eligible;
  if _n = 0 then return 'pendente'; end if;
  _need := least(_n, 3);
  select count(*) into _approvals from public.member_status_request_votes v
   join _eligible e on e.member_id = v.voter_member_id
   where v.request_id = _r.id and v.vote = 'aprovado';
  if _approvals < _need then return 'pendente'; end if;
  if _n >= 3 then
    foreach _role in array array['diretor','tesoureiro','secretario']::public.group_role[] loop
      if exists (select 1 from _eligible e join public.group_member_roles gr on gr.member_id = e.member_id where gr.role = _role)
         and not exists (
           select 1 from public.member_status_request_votes v
           join _eligible e on e.member_id = v.voter_member_id
           join public.group_member_roles gr on gr.member_id = v.voter_member_id and gr.role = _role
           where v.request_id = _r.id and v.vote = 'aprovado') then
        return 'pendente';
      end if;
    end loop;
  end if;
  return 'aprovado';
end; $$;

create or replace function public._validate_status_change(_m public.group_members, _status public.member_status)
returns void language plpgsql stable security definer set search_path = public as $$
declare _directors int;
begin
  if _status = 'convidado' then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  if _m.status = 'excluido' then
    raise exception 'Um membro excluído não pode ser reativado.' using errcode = '22023';
  end if;
  if _status = _m.status then
    raise exception 'O membro já está nesse estado.' using errcode = '22023';
  end if;
  if _status = 'ativo' and _m.status <> 'suspenso' then
    raise exception 'Só é possível reativar membros suspensos. Convites são aceites pelo próprio membro.' using errcode = '22023';
  end if;
  if _status in ('suspenso','excluido') and exists (select 1 from public.group_member_roles where member_id = _m.id and role = 'diretor') then
    select count(*) into _directors from public.group_member_roles r join public.group_members gm on gm.id = r.member_id
     where r.group_id = _m.group_id and r.role = 'diretor' and gm.status = 'ativo' and gm.id <> _m.id;
    if _directors = 0 then
      raise exception 'O grupo deve manter pelo menos um Diretor ativo. Promova outro Diretor primeiro.' using errcode = '22023';
    end if;
  end if;
end; $$;

create or replace function public._apply_status_request(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _r public.member_status_requests%rowtype; _m public.group_members%rowtype; _admin_roles public.group_role[];
begin
  select * into _r from public.member_status_requests where id = _request_id for update;
  select * into _m from public.group_members where id = _r.member_id for update;
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

create or replace function public.request_member_status_change(_member_id uuid, _status public.member_status, _reason text)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.group_members%rowtype; _me uuid; _rid uuid; _state public.request_status;
begin
  select * into _m from public.group_members where id = _member_id;
  if _m.id is null or _uid is null or not public.is_group_admin(_uid, _m.group_id) then
    raise exception 'Apenas a direção do grupo pode pedir alterações de estado.' using errcode = '42501';
  end if;
  _me := public._active_member_id(_uid, _m.group_id);
  if _me = _m.id then
    raise exception 'Não pode pedir a alteração do seu próprio estado.' using errcode = '42501';
  end if;
  perform public._req(_reason, 'O motivo');
  perform public._validate_status_change(_m, _status);
  if exists (select 1 from public.member_status_requests where member_id = _m.id and status = 'pendente') then
    raise exception 'Já existe um pedido pendente para este membro.' using errcode = '23505';
  end if;
  insert into public.member_status_requests(group_id, member_id, from_status, requested_status, reason, requested_by, requested_by_member)
  values (_m.group_id, _m.id, _m.status, _status, btrim(_reason), _uid, _me)
  returning id into _rid;
  insert into public.member_status_request_votes(request_id, group_id, voter_member_id, voter_user_id, vote)
  values (_rid, _m.group_id, _me, _uid, 'aprovado');
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_m.group_id, _uid, 'pedido_estado_criado', 'member_status_request', _rid,
          jsonb_build_object('membro', _m.id, 'pedido', _status));
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
  end if;
  return _state;
end; $$;

create or replace function public.cancel_member_status_request(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid;
begin
  update public.member_status_requests set status = 'cancelado', resolved_at = now()
   where id = _request_id and requested_by = _uid and status = 'pendente'
  returning group_id into _gid;
  if _gid is null then
    raise exception 'Só quem fez o pedido o pode cancelar enquanto estiver pendente.' using errcode = '42501';
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_gid, _uid, 'pedido_estado_cancelado', 'member_status_request', _request_id);
end; $$;

-- Alteração direta de estado deixa de existir
drop function if exists public.set_member_status(uuid, public.member_status);

-- ===================== Permissões de execução =====================
revoke execute on function public._req(text, text) from public, anon, authenticated;
revoke execute on function public._check_member_fields(text, text, text, text, text, date, text) from public, anon, authenticated;
revoke execute on function public._member_label(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._log_admin_roles(uuid, public.group_role[], text, uuid, text) from public, anon, authenticated;
revoke execute on function public._active_member_id(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._status_request_state(uuid) from public, anon, authenticated;
revoke execute on function public._validate_status_change(public.group_members, public.member_status) from public, anon, authenticated;
revoke execute on function public._apply_status_request(uuid) from public, anon, authenticated;

revoke execute on function public.group_board(uuid) from public, anon;
revoke execute on function public.request_member_status_change(uuid, public.member_status, text) from public, anon;
revoke execute on function public.vote_member_status_request(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_member_status_request(uuid) from public, anon;
grant execute on function public.group_board(uuid) to authenticated;
grant execute on function public.request_member_status_change(uuid, public.member_status, text) to authenticated;
grant execute on function public.vote_member_status_request(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_member_status_request(uuid) to authenticated;